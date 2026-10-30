interface Env {
  ASSETS: Fetcher;
  /** Public: the Supabase project URL. */
  SUPABASE_URL: string;
  /** Public: the anon key. The only key the browser ever gets. */
  SUPABASE_ANON_KEY: string;
  /** Secret: service role key. Worker only. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Secret: the admin account's email. */
  ADMIN_EMAIL: string;
  /** Secret: the admin account's auth user id. */
  ADMIN_USER_ID: string;
  /** Secret, optional: read-only Cloudflare token (Account Analytics: Read) for the storage page. */
  CF_ANALYTICS_TOKEN?: string;
  /** Secret, optional: the Cloudflare account id the token reads. */
  CF_ACCOUNT_ID?: string;
}
