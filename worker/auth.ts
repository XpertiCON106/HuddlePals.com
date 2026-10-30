import { adminDb } from "./supabase";
import { jsonError, type AppContext } from "./util";

export type AdminUser = { id: string; email: string };

/**
 * Admin endpoints: a valid Supabase access token (checked with Supabase
 * Auth) whose user id is ADMIN_USER_ID and whose email is ADMIN_EMAIL.
 * Both must match, so an account that merely claims the admin's email
 * (public sign-ups are on for the app) is refused.
 */
export async function requireAdmin(c: AppContext): Promise<AdminUser | Response> {
  const adminEmail = (c.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminId = (c.env.ADMIN_USER_ID ?? "").trim().toLowerCase();
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY || !adminEmail || !adminId) {
    return jsonError(c, 503, "Server is not configured");
  }
  const header = c.req.header("authorization") ?? "";
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
  if (!token) return jsonError(c, 401, "Sign in required");

  const { data, error } = await adminDb(c.env).auth.getUser(token);
  if (error || !data.user) return jsonError(c, 401, "Sign in required");

  const email = (data.user.email ?? "").trim().toLowerCase();
  if (data.user.id.toLowerCase() !== adminId || email !== adminEmail) {
    return jsonError(c, 403, "Not allowed");
  }
  return { id: data.user.id, email };
}
