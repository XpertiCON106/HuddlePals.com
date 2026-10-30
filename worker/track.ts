import type { Hono } from "hono";
import { adminDb } from "./supabase";
import {
  boolish,
  clientIp,
  clip,
  configured,
  hasAdminCookie,
  headerSnapshot,
  hostOf,
  isUuid,
  jsonError,
  num,
  readCf,
  sameOrigin,
  type AppContext,
  type AppEnv,
} from "./util";

// Best-effort limiter for this isolate: 60 tracking requests a minute per client.
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const key = ip || "unknown";
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 4000) {
    const oldest = hits.keys().next().value;
    if (oldest) hits.delete(oldest);
  }
  return recent.length > 60;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value)) {
      if (count >= 60) break;
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) continue;
      out[key] = sanitize(item, depth + 1);
      count += 1;
    }
    return out;
  }
  return null;
}

type TrackEvent = { name?: unknown; props?: unknown; path?: unknown };
type TrackBody = {
  type?: string;
  visitorId?: unknown;
  sessionId?: unknown;
  visitId?: unknown;
  fingerprint?: unknown;
  path?: unknown;
  referrer?: unknown;
  landing?: unknown;
  utm?: unknown;
  client?: unknown;
  engagement?: {
    durationMs?: unknown;
    scrollDepth?: unknown;
    visibleMs?: unknown;
    focusMs?: unknown;
    pathHistory?: unknown;
  };
  perf?: { ttfbMs?: unknown; fcpMs?: unknown; domReadyMs?: unknown; loadMs?: unknown };
  events?: TrackEvent[];
};

const EVENT_NAMES = new Set(["click", "outbound_click", "js_error"]);
const DAY_MS = 24 * 3600 * 1000;

function fingerprintOf(value: unknown): string | null {
  const text = clip(value, 80);
  return text && /^[a-f0-9]{32,64}$/i.test(text) ? text.toLowerCase() : null;
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = num(value);
  return n == null || n < min || n > max ? null : Math.round(n);
}

function numIn(value: unknown, min: number, max: number): number | null {
  const n = num(value);
  return n == null || n < min || n > max ? null : n;
}

function textIn(value: unknown, allowed: RegExp, max = 20): string | null {
  const text = clip(value, max);
  return text && allowed.test(text) ? text : null;
}

/** A public page path; the admin pages are never tracked. */
function pagePath(value: unknown): string | null {
  const path = clip(value, 500);
  if (!path || !path.startsWith("/")) return null;
  if (/^\/admin(\/|$|\?|#)/i.test(path)) return null;
  return path;
}

function utmOf(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const key of ["source", "medium", "campaign", "term", "content"]) {
    const text = clip((value as Record<string, unknown>)[key], 200);
    if (text) out[key] = text;
  }
  return out;
}

// Device, display and connection columns from the sanitized client payload.
function deviceColumns(client: Record<string, unknown>) {
  const screenInfo = (client.screen ?? {}) as Record<string, unknown>;
  const viewport = (client.viewport ?? {}) as Record<string, unknown>;
  const network = (client.network ?? {}) as Record<string, unknown>;
  return {
    screen_w: intIn(screenInfo.w, 1, 20000),
    screen_h: intIn(screenInfo.h, 1, 20000),
    viewport_w: intIn(viewport.w, 1, 20000),
    viewport_h: intIn(viewport.h, 1, 20000),
    pixel_ratio: numIn(screenInfo.dpr, 0.1, 10),
    color_scheme: textIn(client.colorScheme, /^(light|dark)$/),
    reduced_motion: typeof client.reducedMotion === "boolean" ? client.reducedMotion : null,
    net_type: textIn(network.effectiveType, /^(slow-2g|2g|3g|4g)$/),
    net_downlink: numIn(network.downlink, 0, 10000),
    net_rtt: intIn(network.rtt, 0, 60000),
    save_data: typeof network.saveData === "boolean" ? network.saveData : null,
    device_memory: numIn(client.deviceMemory, 0.1, 1024),
    cpu_cores: intIn(client.hardwareConcurrency, 1, 1024),
  };
}

export function registerTrack(app: Hono<AppEnv>) {
  app.post("/api/track", (c) => handleTrack(c));
}

async function handleTrack(c: AppContext) {
  if (!configured(c.env)) return jsonError(c, 503, "Server is not configured");
  if (!sameOrigin(c)) return jsonError(c, 403, "Not allowed");
  const ip = clientIp(c);
  if (limited(ip)) return jsonError(c, 429, "Slow down");

  const raw = await c.req.text();
  if (raw.length > 48_000) return jsonError(c, 413, "Payload too large");
  let body: TrackBody;
  try {
    body = JSON.parse(raw) as TrackBody;
  } catch {
    return jsonError(c, 400, "Invalid JSON");
  }
  if (!body || typeof body !== "object") return jsonError(c, 400, "Invalid payload");

  const visitorId = clip(body.visitorId, 40);
  const sessionId = clip(body.sessionId, 40);
  if (!isUuid(visitorId) || !isUuid(sessionId)) return jsonError(c, 400, "Visitor and session ids are required");

  const isAdmin = hasAdminCookie(c);
  const db = adminDb(c.env);
  const now = new Date().toISOString();
  const visitId = isUuid(body.visitId) ? body.visitId : null;

  if (body.type === "pageview") {
    const path = pagePath(body.path);
    if (!path) return jsonError(c, 400, "Not a public page");
    const cf = readCf(c.req.raw);
    // The referring page without its query string or fragment.
    const referrer = clip(typeof body.referrer === "string" ? body.referrer.split(/[?#]/)[0] : null, 1000);
    const landing = pagePath(body.landing) || path;
    const utm = utmOf(body.utm);
    const client = (sanitize(body.client) as Record<string, unknown> | null) ?? {};
    const fingerprint = fingerprintOf(body.fingerprint);
    const userAgent = clip(c.req.header("user-agent"), 500);

    const visitor = await db.from("analytics_visitors").upsert(
      { id: visitorId, fingerprint, last_seen: now, user_agent: userAgent, is_admin: isAdmin },
      { onConflict: "id" },
    );
    if (visitor.error) return jsonError(c, 500, "Could not record visit");

    // A session keeps the landing page, referrer and UTM it started with.
    const existing = await db.from("analytics_sessions").select("id").eq("id", sessionId).maybeSingle();
    const session = existing.data
      ? await db.from("analytics_sessions").update({ last_seen: now, is_admin: isAdmin }).eq("id", sessionId)
      : await db.from("analytics_sessions").insert({
          id: sessionId,
          visitor_id: visitorId,
          started_at: now,
          last_seen: now,
          landing_path: landing,
          referer: referrer,
          referrer_host: hostOf(referrer),
          utm,
          is_admin: isAdmin,
        });
    if (session.error) return jsonError(c, 500, "Could not record visit");

    const inserted = await db
      .from("analytics_visits")
      .insert({
        visitor_id: visitorId,
        session_id: sessionId,
        visited_at: now,
        path,
        landing_path: landing,
        referer: referrer,
        referrer_host: hostOf(referrer),
        utm,
        ip: ip || null,
        user_agent: userAgent,
        accept_language: clip(c.req.header("accept-language"), 300),
        country: cf.country ?? null,
        region: cf.region ?? null,
        region_code: cf.regionCode ?? null,
        city: cf.city ?? null,
        postal_code: cf.postalCode ?? null,
        latitude: num(cf.latitude),
        longitude: num(cf.longitude),
        timezone: cf.timezone ?? null,
        continent: cf.continent ?? null,
        metro_code: cf.metroCode ?? null,
        is_eu_country: cf.isEUCountry == null ? null : cf.isEUCountry === "1",
        asn: cf.asn != null ? String(cf.asn) : null,
        as_organization: cf.asOrganization ?? null,
        // From Cloudflare's own request data, with no outside lookup: the
        // network's name, and Cloudflare's "T1" country code for Tor.
        isp: cf.asOrganization ?? null,
        is_tor: cf.country == null ? null : cf.country === "T1",
        colo: cf.colo ?? null,
        http_protocol: cf.httpProtocol ?? null,
        tls_version: cf.tlsVersion ?? null,
        tls_cipher: cf.tlsCipher ?? null,
        client_tcp_rtt: num(cf.clientTcpRtt),
        bot_score: num(cf.botManagement?.score),
        verified_bot: boolish(cf.botManagement?.verifiedBot),
        headers: headerSnapshot(c),
        client,
        ...deviceColumns(client),
        fingerprint,
        is_admin: isAdmin,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) return jsonError(c, 500, "Could not record visit");

    const newVisitId = inserted.data.id as string;
    return c.json({ ok: true, visitId: newVisitId });
  }

  if (body.type === "engagement") {
    if (!visitId) return jsonError(c, 400, "Visit id is required");
    const duration = intIn(body.engagement?.durationMs, 0, 7 * DAY_MS);
    const scroll = numIn(body.engagement?.scrollDepth, 0, 100);
    const { error } = await db
      .from("analytics_visits")
      .update({
        duration_ms: duration,
        scroll_depth: scroll != null ? Math.round(scroll) : null,
        visible_ms: intIn(body.engagement?.visibleMs, 0, 7 * DAY_MS),
        focus_ms: intIn(body.engagement?.focusMs, 0, 7 * DAY_MS),
      })
      .eq("id", visitId)
      .eq("session_id", sessionId);
    if (error) return jsonError(c, 500, "Could not record engagement");
    const history = Array.isArray(body.engagement?.pathHistory)
      ? (body.engagement.pathHistory as unknown[])
          .map((item) => pagePath(item))
          .filter((item): item is string => Boolean(item))
          .slice(-50)
      : null;
    await db
      .from("analytics_sessions")
      .update(history ? { last_seen: now, path_history: history } : { last_seen: now })
      .eq("id", sessionId);
    return c.json({ ok: true });
  }

  if (body.type === "perf") {
    if (!visitId) return jsonError(c, 400, "Visit id is required");
    const limit = 10 * 60 * 1000;
    const { error } = await db
      .from("analytics_visits")
      .update({
        ttfb_ms: intIn(body.perf?.ttfbMs, 0, limit),
        fcp_ms: intIn(body.perf?.fcpMs, 0, limit),
        dom_ready_ms: intIn(body.perf?.domReadyMs, 0, limit),
        load_ms: intIn(body.perf?.loadMs, 0, limit),
      })
      .eq("id", visitId)
      .eq("session_id", sessionId);
    if (error) return jsonError(c, 500, "Could not record timing");
    return c.json({ ok: true });
  }

  if (body.type === "events") {
    const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
    const rows = events.flatMap((event) => {
      const name = clip(event?.name, 40);
      if (!name || !EVENT_NAMES.has(name)) return [];
      const path = pagePath(event.path) || pagePath(body.path);
      if (!path) return [];
      return [
        {
          visit_id: visitId,
          visitor_id: visitorId,
          session_id: sessionId,
          name,
          path,
          props: sanitize(event.props) ?? {},
          is_admin: isAdmin,
        },
      ];
    });
    if (!rows.length) return jsonError(c, 400, "Nothing to record");
    const { error } = await db.from("analytics_events").insert(rows);
    if (error) return jsonError(c, 500, "Could not record event");
    return c.json({ ok: true });
  }

  return jsonError(c, 400, "Unknown type");
}
