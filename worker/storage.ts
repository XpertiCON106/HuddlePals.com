import type { Hono } from "hono";
import { requireAdmin } from "./auth";
import { adminDb } from "./supabase";
import { jsonError, type AppEnv } from "./util";

/** Free plan limits (Supabase Free and Workers Free). Change here if a plan changes. */
export const LIMITS = {
  storageBytes: 1024 ** 3, // Supabase file storage: 1 GB
  databaseBytes: 500 * 1024 ** 2, // Supabase database: 500 MB
  requestsPerDay: 100_000, // Workers requests, per account, reset at 00:00 UTC
};

const WARN = 0.7;
const ALERT = 0.9;

type Folder = { folder: string; files: number; bytes: number };
type Usage = {
  bucket: string;
  storage_bytes: number;
  storage_files: number;
  folders: Folder[];
  all_buckets_bytes: number;
  database_bytes: number;
};
type Requests = { today: number; last30: number; days: { date: string; requests: number }[] };

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const REQUESTS_QUERY = `query ($account: String!, $from: Date!, $to: Date!) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
      sum { requests }
      dimensions { date }
    }
  } }
}`;

/** Worker requests per UTC day for the last 30 days, all Workers on the account. */
async function workerRequests(env: Env): Promise<Requests | null> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return null;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const response = await fetch(GRAPHQL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: REQUESTS_QUERY, variables: { account: env.CF_ACCOUNT_ID, from, to: today } }),
  });
  if (!response.ok) throw new Error(`Cloudflare analytics returned ${response.status}`);
  type Row = { sum: { requests: number }; dimensions: { date: string } };
  const body = (await response.json()) as {
    data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: Row[] }[] } };
    errors?: { message: string }[] | null;
  };
  if (body.errors?.length) throw new Error("Cloudflare analytics query failed");
  const byDay = new Map<string, number>();
  for (const row of body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []) {
    byDay.set(row.dimensions.date, (byDay.get(row.dimensions.date) ?? 0) + (row.sum.requests ?? 0));
  }
  const days = [...byDay].map(([date, requests]) => ({ date, requests })).sort((a, b) => a.date.localeCompare(b.date));
  return { today: byDay.get(today) ?? 0, last30: days.reduce((total, day) => total + day.requests, 0), days };
}

function notes(usage: Usage, requests: Requests | null): { level: "warn" | "alert"; text: string }[] {
  const out: { level: "warn" | "alert"; text: string }[] = [];
  const check = (share: number, what: string) => {
    if (share >= ALERT) out.push({ level: "alert", text: `${what} is over 90% of the free plan limit.` });
    else if (share >= WARN) out.push({ level: "warn", text: `${what} is over 70% of the free plan limit.` });
  };
  check(usage.all_buckets_bytes / LIMITS.storageBytes, "File storage");
  check(usage.database_bytes / LIMITS.databaseBytes, "The database");
  if (requests) check(requests.today / LIMITS.requestsPerDay, "Today’s Worker requests");
  return out;
}

export function registerStorage(app: Hono<AppEnv>) {
  app.get("/api/admin/storage", async (c) => {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const { data, error } = await adminDb(c.env).rpc("admin_storage_usage");
    if (error || !data) return jsonError(c, 500, "Could not load storage usage");
    const usage = data as Usage;

    let requests: Requests | null = null;
    let requestsError = "";
    try {
      requests = await workerRequests(c.env);
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "worker requests failed", error: (err as Error).message }));
      requestsError = "Could not load Worker requests";
    }

    return c.json({
      limits: LIMITS,
      supabase: usage,
      cloudflare: { connected: Boolean(c.env.CF_ANALYTICS_TOKEN && c.env.CF_ACCOUNT_ID), error: requestsError, requests },
      notes: notes(usage, requests),
    });
  });
}
