import { Hono } from "hono";
import { registerAnalytics } from "./analytics";
import { adminDb } from "./supabase";
import { registerTrack } from "./track";
import type { AppEnv } from "./util";

// The Worker only runs for /api/* and /admin* (assets.run_worker_first in
// wrangler.jsonc). Every other path is served straight from the static
// assets, with public/_headers, exactly as before.
const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Robots-Tag", "noindex, nofollow");
});

app.get("/api/health", (c) => c.json({ ok: true }));

// What the admin page needs to sign in: the project URL and the anon key.
// Both are public; the service role key never leaves the Worker.
app.get("/api/config", (c) =>
  c.json({ supabaseUrl: c.env.SUPABASE_URL ?? "", supabaseAnonKey: c.env.SUPABASE_ANON_KEY ?? "" }),
);

// Sign-out from the admin page: expires the cookie that flags this browser as
// the admin's, so later visits from it count like anyone else's. It only
// clears a marker in the caller's own browser, so it needs no session (one
// that has already expired still signs out cleanly), but it must come from
// this site.
app.post("/api/admin-signout", (c) => {
  const url = new URL(c.req.url);
  const origin = c.req.header("origin");
  if (origin && origin !== url.origin) return c.json({ error: "Forbidden" }, 403);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  c.header("Set-Cookie", `hp_admin=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`);
  return c.json({ ok: true });
});

registerTrack(app);
registerAnalytics(app);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// /admin and /admin/*: the SPA's index.html, kept out of search engines and
// out of other sites' frames.
app.all("/admin/*", (c) => adminPage(c.req.raw, c.env));
app.all("/admin", (c) => adminPage(c.req.raw, c.env));

app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", message: err.message }));
  return c.json({ error: "Something went wrong" }, 500);
});

async function adminPage(request: Request, env: Env): Promise<Response> {
  // No static file lives under /admin: always serve the app shell (fresh, no
  // conditional request, so the rewrite below always has a body to work on).
  const shell = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const rewritten = new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append('<meta name="robots" content="noindex, nofollow" />', { html: true });
      },
    })
    .transform(shell);
  const response = new Response(rewritten.body, rewritten);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.delete("ETag");
  return response;
}

/** Retention: visits older than 13 months are deleted once a day. */
const KEEP_DAYS = 395;

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_controller, env, ctx) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
    ctx.waitUntil(
      (async () => {
        const { data, error } = await adminDb(env).rpc("analytics_prune", { keep_days: KEEP_DAYS });
        if (error) console.error(JSON.stringify({ level: "error", msg: "analytics prune failed", error: error.message }));
        else console.log(JSON.stringify({ level: "info", msg: "analytics pruned", visits: data }));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
