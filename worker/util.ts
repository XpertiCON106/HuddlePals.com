import type { Context } from "hono";

export type AppEnv = { Bindings: Env };
export type AppContext = Context<AppEnv>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function jsonError(c: AppContext, status: 400 | 401 | 403 | 404 | 413 | 429 | 500 | 503, error: string) {
  return c.json({ error }, status);
}

export function configured(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function clientIp(c: AppContext): string {
  return c.req.header("cf-connecting-ip") || "";
}

export type CfSnap = {
  asn?: number;
  asOrganization?: string;
  colo?: string;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
  country?: string;
  city?: string;
  continent?: string;
  region?: string;
  regionCode?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  metroCode?: string;
  isEUCountry?: string;
  botManagement?: { score?: number; verifiedBot?: boolean };
};

export function readCf(request: Request): CfSnap {
  const cf = (request as Request & { cf?: unknown }).cf;
  return cf && typeof cf === "object" ? (cf as CfSnap) : {};
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function boolish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === 1 || value === "true") return true;
  if (value === "0" || value === 0 || value === "false") return false;
  return null;
}

// Request headers kept with a visit. Never cookies or authorization.
const HEADER_ALLOW = [
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "referer",
  "dnt",
  "sec-gpc",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "cf-ipcountry",
  "cf-ray",
];

export function headerSnapshot(c: AppContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of HEADER_ALLOW) {
    const value = c.req.header(name);
    if (!value) continue;
    // The tracker's own Referer is the page it runs on: keep it without a query string.
    out[name] = (name === "referer" ? value.split(/[?#]/)[0] : value).slice(0, 500);
  }
  return out;
}

export function hostOf(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.slice(0, 200) || null;
  } catch {
    return null;
  }
}

/** Set by the admin page in the admin's own browser, so their visits are flagged. */
export function hasAdminCookie(c: AppContext): boolean {
  return /(?:^|;\s*)hp_admin=1(?:;|$)/.test(c.req.header("cookie") ?? "");
}

export function sameOrigin(c: AppContext): boolean {
  const origin = c.req.header("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}
