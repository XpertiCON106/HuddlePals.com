import type { Hono } from "hono";
import { requireAdmin } from "./auth";
import { adminDb } from "./supabase";
import { clip, isUuid, jsonError, type AppContext, type AppEnv } from "./util";

const CSV_COLUMNS = [
  "id", "visited_at", "path", "landing_path", "visitor_id", "session_id", "ip", "country", "region",
  "region_code", "city", "postal_code", "latitude", "longitude", "timezone", "continent", "asn",
  "as_organization", "isp", "colo", "http_protocol", "tls_version", "tls_cipher", "client_tcp_rtt",
  "bot_score", "verified_bot", "is_vpn", "is_proxy", "is_tor", "is_hosting", "referer", "referrer_host",
  "utm", "user_agent", "accept_language", "fingerprint", "duration_ms", "scroll_depth", "visible_ms",
  "focus_ms", "screen_w", "screen_h", "viewport_w", "viewport_h", "pixel_ratio", "color_scheme",
  "reduced_motion", "net_type", "net_downlink", "net_rtt", "save_data", "device_memory", "cpu_cores",
  "ttfb_ms", "fcp_ms", "dom_ready_ms", "load_ms", "is_admin", "client",
] as const;

/** Dashboard ranges in days; "all" is no lower bound (null for SQL). */
const RANGE_DAYS: Record<string, number | null> = {
  "1": 1, "7": 7, "30": 30, "60": 60, "90": 90, "180": 180, "365": 365, all: null,
};

export function parseRange(value: string | undefined): number | null {
  return value != null && value in RANGE_DAYS ? RANGE_DAYS[value] : 30;
}

function timeZone(value: string | undefined): string {
  const tz = clip(value, 64);
  if (!tz || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const BULK_DELETE_LIMIT = 500;

type Handler = (c: AppContext) => Promise<Response>;
/** Wraps an admin handler: nothing runs until requireAdmin passes. */
const admin = (handler: Handler): Handler => async (c) => {
  const user = await requireAdmin(c);
  if (user instanceof Response) return user;
  return handler(c);
};

export function registerAnalytics(app: Hono<AppEnv>) {
  app.get("/api/admin/me", admin(async (c) => c.json({ ok: true })));

  app.get("/api/admin/summary", admin(async (c) => {
    const { data, error } = await adminDb(c.env).rpc("analytics_summary", {
      range_days: parseRange(c.req.query("range")),
      tz: timeZone(c.req.query("tz")),
    });
    if (error) return jsonError(c, 500, "Could not load analytics");
    return c.json(data ?? {});
  }));

  app.get("/api/admin/experience", admin(async (c) => {
    const { data, error } = await adminDb(c.env).rpc("analytics_experience", {
      range_days: parseRange(c.req.query("range")),
    });
    if (error) return jsonError(c, 500, "Could not load analytics");
    return c.json(data ?? {});
  }));

  // Visits in the last five minutes, for the Live total.
  app.get("/api/admin/live", admin(async (c) => {
    const { count, error } = await adminDb(c.env)
      .from("analytics_visits")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", false)
      .gte("visited_at", new Date(Date.now() - 5 * 60_000).toISOString());
    if (error) return jsonError(c, 500, "Could not load analytics");
    return c.json({ live: count ?? 0 });
  }));

  app.get("/api/admin/visits", admin(async (c) => {
    const page = clampInt(c.req.query("page"), 1, 10000, 1);
    const pageSize = clampInt(c.req.query("pageSize"), 1, 100, 25);
    const { data, error, count } = await visitsQuery(c.env, c.req.query(), LOG_COLUMNS)
      .order("visited_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return jsonError(c, 500, "Could not load visits");
    return c.json({ visits: data ?? [], page, pageSize, total: count ?? 0 });
  }));

  app.get("/api/admin/visits/:id", admin(async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return jsonError(c, 404, "Visit not found");
    const db = adminDb(c.env);
    const visit = await db.from("analytics_visits").select("*").eq("id", id).maybeSingle();
    if (visit.error || !visit.data) return jsonError(c, 404, "Visit not found");
    const row = visit.data as { id: string; visit_id?: string; session_id: string | null; visitor_id: string | null };
    const [events, session, related] = await Promise.all([
      db.from("analytics_events").select("*").eq("visit_id", id).order("occurred_at", { ascending: true }).limit(200),
      row.session_id
        ? db.from("analytics_sessions").select("*").eq("id", row.session_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Other visits from the same browser (its random visitor id). Nothing else is matched.
      row.visitor_id
        ? db
            .from("analytics_visits")
            .select("id, visited_at, path, city, region_code, country")
            .eq("visitor_id", row.visitor_id)
            .neq("id", id)
            .order("visited_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);
    return c.json({ visit: row, session: session.data, events: events.data ?? [], related: related.data ?? [] });
  }));

  app.delete("/api/admin/visits/:id", admin(async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return jsonError(c, 404, "Visit not found");
    const { data, error } = await adminDb(c.env).rpc("analytics_delete_visits", { ids: [id] });
    if (error) return jsonError(c, 500, "Could not delete the visit");
    if (!data) return jsonError(c, 404, "Visit not found");
    return c.json({ ok: true, deleted: data });
  }));

  // Bulk delete from the visit log: {"ids": [...]}, at most BULK_DELETE_LIMIT.
  app.post("/api/admin/visits/delete", admin(async (c) => {
    const body = await c.req.json<{ ids?: unknown }>().catch(() => null);
    const raw = body && Array.isArray(body.ids) ? body.ids : null;
    if (!raw || raw.length === 0) return jsonError(c, 400, "Send the visit ids to delete");
    if (raw.length > BULK_DELETE_LIMIT) return jsonError(c, 400, `At most ${BULK_DELETE_LIMIT} visits at a time`);
    if (!raw.every((id) => isUuid(id))) return jsonError(c, 400, "Invalid visit id");
    const { data, error } = await adminDb(c.env).rpc("analytics_delete_visits", { ids: [...new Set(raw as string[])] });
    if (error) return jsonError(c, 500, "Could not delete the visits");
    return c.json({ ok: true, deleted: data ?? 0 });
  }));

  // Empties the five analytics_ tables. The page asks for DELETE to be typed; so does the API.
  app.delete("/api/admin/analytics", admin(async (c) => {
    if (c.req.query("confirm") !== "DELETE") return jsonError(c, 400, "Confirmation is required");
    const { data, error } = await adminDb(c.env).rpc("analytics_clear_all");
    if (error) return jsonError(c, 500, "Could not clear analytics");
    return c.json({ ok: true, deleted: data ?? 0 });
  }));

  app.get("/api/admin/export.csv", admin(async (c) => {
    const rows: Record<string, unknown>[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 50_000; offset += pageSize) {
      const { data, error } = await visitsQuery(c.env, c.req.query(), "*")
        .order("visited_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return jsonError(c, 500, "Could not export visits");
      if (!data?.length) break;
      rows.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < pageSize) break;
    }
    const lines = [CSV_COLUMNS.join(",")];
    for (const row of rows) lines.push(CSV_COLUMNS.map((key) => csvCell(row[key])).join(","));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(lines.join("\r\n") + "\r\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="huddlepals-visits-${c.req.query("range") ?? "30"}-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }));
}

const LOG_COLUMNS =
  "id, visited_at, path, referrer_host, city, region, region_code, country, ip, is_vpn, is_proxy, is_tor, is_hosting, client, visitor_id, duration_ms, is_admin";

function visitsQuery(env: Env, query: Record<string, string | undefined>, columns: string) {
  let request = adminDb(env).from("analytics_visits").select(columns, { count: "exact" });
  if (query.includeAdmin !== "true") request = request.eq("is_admin", false);
  const range = parseRange(query.range);
  if (typeof range === "number") {
    request = request.gte("visited_at", new Date(Date.now() - range * 86_400_000).toISOString());
  }
  if (isUuid(query.visitorId)) request = request.eq("visitor_id", query.visitorId);
  const q = (query.q ?? "").replace(/[^a-zA-Z0-9 ._:/-]/g, "").trim().slice(0, 80);
  if (q) {
    request = request.or(
      `path.ilike.*${q}*,city.ilike.*${q}*,region.ilike.*${q}*,country.ilike.*${q}*,ip.ilike.*${q}*,referrer_host.ilike.*${q}*`,
    );
  }
  return request;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!value || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** One CSV cell, quoted as needed; text a spreadsheet would run as a formula gets a leading '. */
function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
