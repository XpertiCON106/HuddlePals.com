// Website analytics for the public pages (never /admin). Sends page views,
// time on page, page timing, clicks on links and buttons, and script errors
// to the site's own Worker (/api/track). It never reads form fields or key
// presses, never records the screen, never asks for location, and never
// reads the address bar's #fragment or query string (invite codes live
// there), except the utm_ campaign tags.

const VISITOR_KEY = "hp_vid";
const SESSION_KEY = "hp_sid";
const FP_KEY = "hp_fp";
const LANDING_KEY = "hp_landing";
const REF_KEY = "hp_ref";
const PATHS_KEY = "hp_paths";
const UTM_KEY = "hp_utm";
const ADMIN_COOKIE = "hp_admin";

let currentVisitId: string | null = null;
let currentPath = "";
let pageStarted = Date.now();
let maxScroll = 0;
let booted = false;

// Visible and focused time for the current page, apart from wall-clock time.
let visibleMs = 0;
let focusMs = 0;
let visibleSince: number | null = null;
let focusSince: number | null = null;

// Page timing goes once, for the first page of a full load.
let perfSent = false;

// Script errors are capped per page so a loop can't flood the endpoint.
const MAX_ERRORS_PER_PAGE = 5;
let errorsThisPage = 0;
const errorKeys = new Set<string>();

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function stored(kind: "local" | "session", key: string, make: () => string): string {
  const store = storage(kind);
  const existing = store?.getItem(key);
  if (existing) return existing;
  const value = make();
  try {
    store?.setItem(key, value);
  } catch {
    // Storage full or blocked: the id lasts for this page only.
  }
  return value;
}

const visitorId = () => stored("local", VISITOR_KEY, () => crypto.randomUUID());
const sessionId = () => stored("session", SESSION_KEY, () => crypto.randomUUID());

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canvasSample(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#f76b15";
    ctx.fillRect(0, 0, 220, 48);
    ctx.fillStyle = "#1c1917";
    ctx.font = "16px Georgia";
    ctx.fillText("HuddlePals", 10, 30);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function webglInfo(): { vendor: string; renderer: string } {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !ext) return { vendor: "", renderer: "" };
    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? ""),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? ""),
    };
  } catch {
    return { vendor: "", renderer: "" };
  }
}

/** A hash of the browser's rendering and hardware traits (no raw values leave the page). */
async function fingerprint(): Promise<string> {
  const cached = storage("local")?.getItem(FP_KEY);
  if (cached) return cached;
  const webgl = webglInfo();
  const hash = await sha256(
    [
      canvasSample(),
      webgl.vendor,
      webgl.renderer,
      screen.width,
      screen.height,
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency ?? "",
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "",
    ].join("|"),
  ).catch(() => "");
  try {
    if (hash) storage("local")?.setItem(FP_KEY, hash);
  } catch {
    // Ignore storage errors.
  }
  return hash;
}

type Hints = { mobile?: boolean; platform?: string; brands?: { brand: string; version: string }[]; model?: string; platformVersion?: string };

async function clientHints(): Promise<Hints> {
  const data = (navigator as Navigator & {
    userAgentData?: Hints & { getHighEntropyValues?: (hints: string[]) => Promise<Hints> };
  }).userAgentData;
  if (!data) return {};
  const base: Hints = { mobile: data.mobile, platform: data.platform, brands: data.brands };
  if (!data.getHighEntropyValues) return base;
  try {
    const high = await Promise.race([
      data.getHighEntropyValues(["model", "platformVersion"]),
      new Promise<Hints>((resolve) => setTimeout(() => resolve({}), 400)),
    ]);
    return { ...base, model: high.model, platformVersion: high.platformVersion };
  } catch {
    return base;
  }
}

function parseAgent(ua: string, hints: Hints) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /SamsungBrowser\//.test(ua)
        ? "Samsung Internet"
        : /CriOS\/|Chrome\//.test(ua)
          ? "Chrome"
          : /FxiOS\/|Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other";
  let os = "Other";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = navigator.maxTouchPoints > 1 ? "iPadOS" : "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  const tablet = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || os === "iPadOS";
  const mobile = !tablet && (hints.mobile || /Mobi|iPhone|iPod/.test(ua));
  return { browser, os, device: tablet ? "tablet" : mobile ? "mobile" : "desktop" };
}

type NetworkInfo = { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };

async function clientPayload() {
  const hints = await clientHints();
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: NetworkInfo };
  return {
    ...parseAgent(navigator.userAgent, hints),
    brands: hints.brands ?? [],
    model: hints.model ?? "",
    platformVersion: hints.platformVersion ?? "",
    screen: {
      w: screen.width,
      h: screen.height,
      availW: screen.availWidth,
      availH: screen.availHeight,
      dpr: window.devicePixelRatio,
      colorDepth: screen.colorDepth,
      orientation: screen.orientation?.type || (innerWidth > innerHeight ? "landscape" : "portrait"),
    },
    viewport: { w: innerWidth, h: innerHeight },
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    languages: navigator.languages,
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffset: new Date().getTimezoneOffset(),
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    webgl: webglInfo(),
    network: nav.connection
      ? {
          effectiveType: nav.connection.effectiveType,
          downlink: nav.connection.downlink,
          rtt: nav.connection.rtt,
          saveData: nav.connection.saveData,
        }
      : null,
    cookiesEnabled: navigator.cookieEnabled,
    dnt: navigator.doNotTrack === "1",
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(storage("session")?.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key: string, value: string) {
  try {
    storage("session")?.setItem(key, value);
  } catch {
    // Ignore storage errors.
  }
}

function pathHistory(): string[] {
  const parsed = readJson<unknown>(PATHS_KEY, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-50) : [];
}

function send(payload: unknown, beacon = false) {
  const body = JSON.stringify(payload);
  if (beacon && navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function ids() {
  return { visitorId: visitorId(), sessionId: sessionId(), visitId: currentVisitId };
}

const isVisible = () => document.visibilityState === "visible";
const isFocused = () => isVisible() && document.hasFocus();

function settleTimers(now = Date.now()) {
  if (visibleSince != null) visibleMs += now - visibleSince;
  if (focusSince != null) focusMs += now - focusSince;
  visibleSince = isVisible() ? now : null;
  focusSince = isFocused() ? now : null;
}

function resetTimers() {
  visibleMs = 0;
  focusMs = 0;
  const now = Date.now();
  visibleSince = isVisible() ? now : null;
  focusSince = isFocused() ? now : null;
}

/** The leave beacon: time on page, scroll depth, visible and focused time so far (each one replaces the last). */
function flush(beacon: boolean) {
  if (!currentVisitId) return;
  settleTimers();
  const height = document.documentElement.scrollHeight - innerHeight;
  const scrollDepth = height > 0 ? Math.min(100, Math.round((maxScroll / height) * 100)) : 100;
  send(
    {
      ...ids(),
      type: "engagement",
      path: currentPath,
      engagement: { durationMs: Date.now() - pageStarted, scrollDepth, visibleMs, focusMs, pathHistory: pathHistory() },
    },
    beacon,
  );
}

function trackEvent(name: "click" | "outbound_click" | "js_error", props: Record<string, unknown>, beacon = false) {
  if (!booted) return;
  send({ ...ids(), type: "events", path: currentPath, events: [{ name, path: currentPath, props }] }, beacon);
}

const roundMs = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

function sendPerf() {
  if (perfSent) return;
  perfSent = true;
  const read = () => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    send({
      ...ids(),
      type: "perf",
      path: currentPath,
      perf: {
        ttfbMs: roundMs(nav?.responseStart),
        fcpMs: roundMs(fcp?.startTime),
        domReadyMs: roundMs(nav?.domContentLoadedEventEnd),
        loadMs: roundMs(nav?.loadEventEnd),
      },
    });
  };
  // loadEventEnd is filled in only after the load handlers have run.
  if (document.readyState === "complete") setTimeout(read, 0);
  else window.addEventListener("load", () => setTimeout(read, 0), { once: true });
}

/** Where a link goes, without its query or fragment; for app links only the scheme. */
function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw, location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol;
    return (url.origin === location.origin ? url.pathname : url.origin + url.pathname).slice(0, 300);
  } catch {
    return "";
  }
}

function labelOf(el: HTMLElement): string {
  return (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// Clicks on links and buttons: what was clicked and where it goes. Never form values.
function onClick(event: MouseEvent) {
  const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("a, button, [role=button], [data-track]");
  if (!el) return;
  const anchor = el instanceof HTMLAnchorElement ? el : null;
  let outbound = false;
  if (anchor?.href) {
    try {
      outbound = new URL(anchor.href, location.href).origin !== location.origin;
    } catch {
      outbound = false;
    }
  }
  trackEvent(
    outbound ? "outbound_click" : "click",
    { id: el.dataset.track || "", tag: el.tagName.toLowerCase(), label: labelOf(el), href: anchor?.href ? cleanUrl(anchor.href) : "" },
    outbound,
  );
}

function reportError(kind: "error" | "rejection", message: string, source = "", line?: number, col?: number) {
  if (errorsThisPage >= MAX_ERRORS_PER_PAGE) return;
  const key = `${kind}|${message}|${source}|${line ?? ""}`;
  if (errorKeys.has(key)) return;
  errorKeys.add(key);
  errorsThisPage += 1;
  trackEvent("js_error", { kind, message: message.slice(0, 300), source, line: line ?? null, col: col ?? null });
}

function onError(event: ErrorEvent) {
  const err = event.error as Error | undefined;
  reportError("error", String(event.message || err?.message || "Script error"), event.filename ? cleanUrl(event.filename) : "", event.lineno, event.colno);
}

function onRejection(event: PromiseRejectionEvent) {
  const reason = event.reason as { message?: unknown } | undefined;
  const message = reason && typeof reason === "object" && "message" in reason ? String(reason.message) : String(event.reason);
  reportError("rejection", message);
}

function initTracking() {
  if (booted) return;
  booted = true;
  if (!storage("session")?.getItem(LANDING_KEY)) {
    writeSession(LANDING_KEY, location.pathname);
    let referrer = "";
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin !== location.origin) referrer = (ref.origin + ref.pathname).slice(0, 500);
    } catch {
      referrer = "";
    }
    writeSession(REF_KEY, referrer);
    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    for (const key of ["source", "medium", "campaign", "term", "content"]) {
      const value = params.get(`utm_${key}`);
      if (value) utm[key] = value.slice(0, 120);
    }
    writeSession(UTM_KEY, JSON.stringify(utm));
  }
  window.addEventListener("scroll", () => (maxScroll = Math.max(maxScroll, window.scrollY)), { passive: true });
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    settleTimers();
    // On phones a hidden tab may never fire pagehide; send what we have.
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("focus", () => settleTimers());
  window.addEventListener("blur", () => settleTimers());
  document.addEventListener("click", onClick, { capture: true });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}

/** Records a page view of a public page. Call on every route change. */
export async function trackPage(path: string) {
  if (/^\/admin(\/|$)/.test(path)) return;
  // The same page reported twice in a row (React StrictMode in development).
  if (path === currentPath && Date.now() - pageStarted < 1000) return;
  initTracking();
  flush(false);
  currentVisitId = null;
  currentPath = path;
  pageStarted = Date.now();
  maxScroll = 0;
  errorsThisPage = 0;
  errorKeys.clear();
  resetTimers();
  writeSession(PATHS_KEY, JSON.stringify([...pathHistory(), path].slice(-50)));
  const [fp, client] = await Promise.all([fingerprint(), clientPayload()]);
  const response = await fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...ids(),
      type: "pageview",
      path,
      fingerprint: fp,
      referrer: storage("session")?.getItem(REF_KEY) || "",
      landing: storage("session")?.getItem(LANDING_KEY) || path,
      utm: readJson(UTM_KEY, {}),
      client,
    }),
  }).catch(() => null);
  if (!response?.ok || currentPath !== path) return;
  const data = (await response.json().catch(() => null)) as { visitId?: string } | null;
  currentVisitId = data?.visitId ?? null;
  if (currentVisitId) sendPerf();
}

/**
 * Stops flagging this browser as the admin's: clears the cookie here and has the
 * Worker expire it too (which would also clear it were it ever httpOnly).
 */
export async function clearAdminMark(): Promise<void> {
  markAdmin(false);
  await fetch("/api/admin-signout", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => null);
}

/** Flags this browser as the admin's, so its visits are left out of the numbers. */
export function markAdmin(active: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = active
    ? `${ADMIN_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`
    : `${ADMIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
