import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { clearAdminMark, markAdmin } from "../lib/track";
import { authUrlError, clearAuthUrl, isRecoveryPending, recoveryTokenHash, setRecoveryPending } from "../lib/recovery";
import { adminApi, ApiError } from "./api";
import { Dashboard } from "./Dashboard";
import { getSupabase } from "./supabase";
import { VisitDetail } from "./VisitDetail";
import "./admin.css";

type Admin = { supabase: SupabaseClient; token: string; email: string };
const AdminContext = createContext<Admin | null>(null);

export function useAdmin(): Admin {
  const value = useContext(AdminContext);
  if (!value) throw new Error("Admin context missing");
  return value;
}

type Theme = "system" | "light" | "dark";
const THEME_KEY = "hp-admin-theme";

function useTheme() {
  const [pref, setPref] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const resolved = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.colorScheme;
    root.style.colorScheme = resolved;
    return () => {
      root.style.colorScheme = before;
    };
  }, [resolved]);
  function choose(next: Theme) {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not remembered when storage is blocked.
    }
  }
  return { pref, resolved, choose };
}

const ThemeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeSwitch() {
  const theme = useContext(ThemeContext);
  if (!theme) return null;
  const order: Theme[] = ["system", "light", "dark"];
  const label = { system: "Auto", light: "Light", dark: "Dark" };
  return (
    <div className="a-segment a-theme" role="group" aria-label="Appearance">
      {order.map((item) => (
        <button key={item} type="button" aria-pressed={theme.pref === item} onClick={() => theme.choose(item)}>
          {label[item]}
        </button>
      ))}
    </div>
  );
}

export default function AdminApp() {
  const theme = useTheme();
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    const title = document.title;
    document.title = "Analytics · HuddlePals";
    return () => {
      robots.remove();
      document.title = title;
    };
  }, []);
  return (
    <ThemeContext.Provider value={theme}>
      <div className="hp-admin" data-theme={theme.resolved}>
        <Routes>
          <Route path="login" element={<AuthGate mode="login" />} />
          <Route path="*" element={<AuthGate mode="app" />} />
        </Routes>
      </div>
    </ThemeContext.Provider>
  );
}

type Status = "loading" | "signed-out" | "recovery" | "checking" | "not-admin" | "ready" | "error";

function AuthGate({ mode }: { mode: "login" | "app" }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [recovery, setRecovery] = useState(isRecoveryPending);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    getSupabase()
      .then(async (client) => {
        if (cancelled) return;
        setSupabase(client);
        const { data } = client.auth.onAuthStateChange((event, next) => {
          if (event === "PASSWORD_RECOVERY") {
            setRecoveryPending(true);
            setRecovery(true);
          }
          if (event === "SIGNED_OUT") {
            // Also when signed out in another tab or by an expired session.
            markAdmin(false);
            setRecoveryPending(false);
            setRecovery(false);
          }
          setSession(next);
        });
        unsubscribe = () => data.subscription.unsubscribe();
        // A recovery link sent with a token hash (custom email template).
        if (recoveryTokenHash) {
          const { error: otpError } = await client.auth.verifyOtp({ token_hash: recoveryTokenHash, type: "recovery" });
          if (otpError) setError("That link did not work. Ask for a new one.");
          else {
            setRecoveryPending(true);
            setRecovery(true);
          }
        }
        const { data: current } = await client.auth.getSession();
        if (cancelled) return;
        setSession(current.session);
        setStatus(current.session ? "checking" : "signed-out");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load sign-in");
        setStatus("error");
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const token = session?.access_token ?? "";
  useEffect(() => {
    if (status === "loading" || status === "error") return;
    if (!token) {
      if (recovery) {
        setRecoveryPending(false);
        setRecovery(false);
      }
      setStatus("signed-out");
      return;
    }
    if (recovery) {
      setStatus("recovery");
      return;
    }
    setStatus("checking");
    let cancelled = false;
    adminApi("/api/admin/me", token)
      .then(() => {
        if (cancelled) return;
        markAdmin(true);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setStatus("not-admin");
        else if (err instanceof ApiError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Could not check the account");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, recovery, status === "loading"]);

  if (status === "loading" || status === "checking") return <Centered><p className="a-muted">Checking sign-in…</p></Centered>;
  if (status === "error" || !supabase) return <Centered><p className="a-danger" role="alert">{error || "Something went wrong."}</p></Centered>;
  if (status === "recovery" && session) {
    return (
      <SetPasswordForm
        supabase={supabase}
        email={session.user.email ?? ""}
        onDone={() => {
          setRecoveryPending(false);
          setRecovery(false);
          clearAuthUrl();
        }}
      />
    );
  }
  if (status === "not-admin") {
    return (
      <Centered>
        <h1 className="a-title">Not the admin account</h1>
        <p className="a-muted">This account can’t open the dashboard.</p>
        <button className="a-btn" type="button" onClick={() => void signOutAdmin(supabase)}>
          Sign out
        </button>
      </Centered>
    );
  }
  if (mode === "login") {
    return status === "ready" ? <Navigate to="/admin" replace /> : <LoginForm supabase={supabase} initialError={error} />;
  }
  if (status === "signed-out") return <Navigate to="/admin/login" replace />;
  return (
    <AdminContext.Provider value={{ supabase, token, email: session?.user.email ?? "" }}>
      <Shell>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="visits/:id" element={<VisitDetail />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Shell>
    </AdminContext.Provider>
  );
}

/** Signs out and stops flagging this browser, so its later visits count normally. */
async function signOutAdmin(supabase: SupabaseClient) {
  await clearAdminMark();
  await supabase.auth.signOut();
}

function Brand() {
  return (
    <Link to="/admin" className="a-brand">
      <img src="/logo.webp" alt="" width={458} height={327} />
      <span>HuddlePals</span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { supabase } = useAdmin();
  const navigate = useNavigate();
  return (
    <>
      <header className="a-header">
        <div className="a-wrap a-header-row">
          <div className="a-header-brand">
            <Brand />
            <span className="a-tag">Analytics</span>
          </div>
          <div className="a-header-actions">
            <ThemeSwitch />
            <button
              className="a-btn a-btn-ghost"
              type="button"
              onClick={() => void signOutAdmin(supabase).then(() => navigate("/admin/login"))}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="a-center">
      <div className="a-center-top">
        <Brand />
        <ThemeSwitch />
      </div>
      <div className="a-center-body">{children}</div>
    </main>
  );
}

function LoginForm({ supabase, initialError }: { supabase: SupabaseClient; initialError: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    initialError || (authUrlError ? `That link didn’t work: ${authUrlError}. Ask for a new one.` : ""),
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authUrlError) clearAuthUrl();
  }, []);

  async function onForgot() {
    setError("");
    setNotice("");
    const address = email.trim();
    if (!address) {
      setError("Enter your email first, then choose Forgot password.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/admin`,
    });
    setBusy(false);
    if (resetError) setError(resetError.message || "Could not send the email.");
    else setNotice("If that’s the admin account, a link to set a new password is on its way.");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signError) {
      setError("That email and password didn’t match.");
      return;
    }
    navigate("/admin", { replace: true });
  }

  return (
    <Centered>
      <h1 className="a-title">Sign in</h1>
      <p className="a-muted">Site analytics for the HuddlePals team.</p>
      <form className="a-card a-form" onSubmit={onSubmit}>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="a-danger a-small" role="alert">{error}</p>}
        {notice && <p className="a-note a-small" role="status">{notice}</p>}
        <button className="a-btn a-btn-solid a-btn-wide" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" className="a-link-button" onClick={() => void onForgot()} disabled={busy}>
          Forgot password?
        </button>
      </form>
      <Link className="a-back" to="/">
        Back to huddlepals.com
      </Link>
    </Centered>
  );
}

const MIN_PASSWORD = 12;

function SetPasswordForm({ supabase, email, onDone }: { supabase: SupabaseClient; email: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don’t match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message || "Could not save the password.");
      return;
    }
    onDone();
  }

  return (
    <Centered>
      <h1 className="a-title">Set a new password</h1>
      {email && <p className="a-muted">For {email}</p>}
      <form className="a-card a-form" onSubmit={onSubmit}>
        <label>
          <span>New password</span>
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          <span>Confirm password</span>
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </label>
        <p className="a-muted a-small">At least {MIN_PASSWORD} characters.</p>
        {error && <p className="a-danger a-small" role="alert">{error}</p>}
        <button className="a-btn a-btn-solid a-btn-wide" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </Centered>
  );
}
