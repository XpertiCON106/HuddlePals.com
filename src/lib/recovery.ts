// Password recovery for the admin page. Read at startup, before supabase-js
// reads and clears the auth parameters from the address bar.
const KEY = "hp_password_recovery";

function urlParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  new URLSearchParams(window.location.hash.replace(/^#/, "")).forEach((value, key) => params.set(key, value));
  return params;
}

const onAdmin = /^\/admin(\/|$)/.test(window.location.pathname);
const initial = onAdmin ? urlParams() : new URLSearchParams();

/** An auth error passed back in the redirect URL, for example an expired link. */
export const authUrlError: string | null = initial.get("error_description") || initial.get("error") || null;

/** A recovery link that carries a token hash instead of a session (custom email template). */
export const recoveryTokenHash: string | null =
  initial.get("type") === "recovery" ? initial.get("token_hash") : null;

let pending = initial.get("type") === "recovery";
if (pending) {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage can be blocked; the in-memory flag still works.
  }
}

export function isRecoveryPending(): boolean {
  if (pending) return true;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setRecoveryPending(value: boolean) {
  pending = value;
  try {
    if (value) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    // Ignore storage errors.
  }
}

/** Drops auth tokens and recovery markers from the address bar. */
export function clearAuthUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  for (const key of ["type", "code", "token_hash", "error", "error_code", "error_description"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
}
