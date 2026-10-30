import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApi } from "./api";
import { useAdmin } from "./AdminApp";
import { ConfirmDelete } from "./Dialogs";
import { countryName, ms, place, when } from "./format";
import type { MapPin, Visit, VisitEvent } from "./types";

const VisitMap = lazy(() => import("./VisitMap"));

type Detail = {
  visit: Visit;
  session: Record<string, unknown> | null;
  events: VisitEvent[];
  related: { id: string; visited_at: string; path: string | null; city: string | null; region_code: string | null; country: string | null }[];
};

type Field = { label: string; value: (visit: Visit) => unknown };

const client = (key: string) => (visit: Visit) => visit.client?.[key];
const yesNo = (value: unknown) => (value == null ? null : value ? "Yes" : "No");
const flag = (key: string) => (visit: Visit) => {
  const value = visit[key];
  if (value == null) return "Not checked";
  return value ? "Yes" : "No";
};

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "When and where",
    fields: [
      { label: "Time", value: (v) => when(v.visited_at) },
      { label: "Page", value: (v) => v.path },
      { label: "Landing page", value: (v) => v.landing_path },
      { label: "Referrer", value: (v) => v.referer || "Direct" },
      { label: "Campaign", value: (v) => utmText(v.utm) },
      { label: "Place", value: (v) => place(v) },
      { label: "Region", value: (v) => v.region },
      { label: "Postal code", value: (v) => v.postal_code },
      { label: "Country", value: (v) => (v.country ? `${countryName(v.country)} (${v.country})` : null) },
      { label: "Continent", value: (v) => v.continent },
      { label: "In the EU", value: (v) => yesNo(v.is_eu_country) },
      { label: "Time zone", value: (v) => v.timezone },
      { label: "Coordinates", value: (v) => (v.latitude != null && v.longitude != null ? `${v.latitude}, ${v.longitude}` : null) },
    ],
  },
  {
    title: "Network",
    fields: [
      { label: "IP address", value: (v) => v.ip },
      { label: "Network", value: (v) => v.as_organization },
      { label: "ASN", value: (v) => (v.asn ? `AS${v.asn}` : null) },
      { label: "ISP", value: (v) => v.isp },
      { label: "VPN", value: flag("is_vpn") },
      { label: "Proxy", value: flag("is_proxy") },
      { label: "Tor", value: flag("is_tor") },
      { label: "Hosting", value: flag("is_hosting") },
      { label: "Cloudflare data center", value: (v) => v.colo },
      { label: "Protocol", value: (v) => [v.http_protocol, v.tls_version].filter(Boolean).join(" · ") },
      { label: "TLS cipher", value: (v) => v.tls_cipher },
      { label: "TCP round trip", value: (v) => (v.client_tcp_rtt != null ? `${v.client_tcp_rtt} ms` : null) },
      { label: "Bot score", value: (v) => v.bot_score },
      { label: "Verified bot", value: (v) => yesNo(v.verified_bot) },
    ],
  },
  {
    title: "Browser and device",
    fields: [
      { label: "Browser", value: client("browser") },
      { label: "Operating system", value: client("os") },
      { label: "Device", value: client("device") },
      { label: "Languages", value: (v) => (Array.isArray(v.client?.languages) ? (v.client?.languages as string[]).join(", ") : v.accept_language) },
      { label: "Time zone (browser)", value: client("timezone") },
      { label: "Screen", value: (v) => (v.screen_w ? `${v.screen_w} × ${v.screen_h}` : null) },
      { label: "Window", value: (v) => (v.viewport_w ? `${v.viewport_w} × ${v.viewport_h}` : null) },
      { label: "Pixel ratio", value: (v) => v.pixel_ratio },
      { label: "Color scheme", value: (v) => v.color_scheme },
      { label: "Reduced motion", value: (v) => yesNo(v.reduced_motion) },
      { label: "CPU cores", value: (v) => v.cpu_cores },
      { label: "Memory", value: (v) => (v.device_memory != null ? `${v.device_memory} GB` : null) },
      { label: "Touch points", value: client("maxTouchPoints") },
      { label: "Graphics", value: (v) => { const gl = v.client?.webgl as { renderer?: string; vendor?: string } | undefined; return gl ? gl.renderer || gl.vendor : null; } },
      { label: "Connection", value: (v) => [v.net_type, v.net_downlink != null ? `${v.net_downlink} Mbps` : null, v.net_rtt != null ? `${v.net_rtt} ms` : null].filter(Boolean).join(" · ") },
      { label: "Data saver", value: (v) => yesNo(v.save_data) },
      { label: "Do Not Track", value: (v) => yesNo(v.client?.dnt) },
      { label: "Model", value: client("model") },
      { label: "User agent", value: (v) => v.user_agent },
    ],
  },
  {
    title: "Timing and attention",
    fields: [
      { label: "Server response", value: (v) => (v.ttfb_ms != null ? ms(Number(v.ttfb_ms)) : null) },
      { label: "First paint", value: (v) => (v.fcp_ms != null ? ms(Number(v.fcp_ms)) : null) },
      { label: "DOM ready", value: (v) => (v.dom_ready_ms != null ? ms(Number(v.dom_ready_ms)) : null) },
      { label: "Page load", value: (v) => (v.load_ms != null ? ms(Number(v.load_ms)) : null) },
      { label: "Time on page", value: (v) => (v.duration_ms != null ? ms(Number(v.duration_ms)) : null) },
      { label: "Visible", value: (v) => (v.visible_ms != null ? ms(Number(v.visible_ms)) : null) },
      { label: "Focused", value: (v) => (v.focus_ms != null ? ms(Number(v.focus_ms)) : null) },
      { label: "Scrolled", value: (v) => (v.scroll_depth != null ? `${v.scroll_depth}%` : null) },
    ],
  },
  {
    title: "Identity",
    fields: [
      { label: "Visit", value: (v) => v.id },
      { label: "Browser id", value: (v) => v.visitor_id },
      { label: "Session", value: (v) => v.session_id },
      { label: "Fingerprint", value: (v) => v.fingerprint },
      { label: "Your visit", value: (v) => yesNo(v.is_admin) },
    ],
  },
];

function utmText(utm: unknown): string | null {
  if (!utm || typeof utm !== "object") return null;
  const entries = Object.entries(utm as Record<string, unknown>).filter(([, value]) => value);
  return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(", ") : null;
}

function show(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const EVENT_LABELS: Record<string, string> = { click: "Click", outbound_click: "Outbound click", js_error: "Script error" };

function eventText(event: VisitEvent): string {
  const props = event.props || {};
  const text = (key: string) => (typeof props[key] === "string" || typeof props[key] === "number" ? String(props[key]) : "");
  if (event.name === "js_error") return text("message");
  return [text("label"), text("href")].filter(Boolean).join(" → ");
}

export function VisitDetail() {
  const { id = "" } = useParams();
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError("");
    adminApi<Detail>(`/api/admin/visits/${encodeURIComponent(id)}`, token)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [id, token]);

  if (error) {
    return (
      <main className="a-wrap a-main">
        <Link className="a-back" to="/admin">← All visits</Link>
        <p className="a-danger" role="alert">{error}</p>
      </main>
    );
  }
  if (!detail) return <main className="a-wrap a-main"><p className="a-muted">Loading visit…</p></main>;

  const visit = detail.visit;
  const pin: MapPin | null =
    typeof visit.latitude === "number" && typeof visit.longitude === "number"
      ? {
          id: visit.id,
          lat: visit.latitude,
          lon: visit.longitude,
          visitedAt: visit.visited_at,
          city: visit.city,
          region: visit.region,
          regionCode: visit.region_code,
          postalCode: visit.postal_code,
          country: visit.country,
          path: visit.path,
          visitorId: visit.visitor_id,
          device: String(visit.client?.device || ""),
        }
      : null;
  const headers = Object.entries(visit.headers ?? {});

  return (
    <main className="a-wrap a-main">
      <Link className="a-back" to="/admin">← All visits</Link>
      <div className="a-heading-row">
        <div>
          <p className="a-eyebrow">{when(visit.visited_at)}</p>
          <h1 className="a-title a-mono-title">{visit.path || "/"}</h1>
          <p className="a-muted">{[place(visit), String(visit.client?.browser ?? ""), String(visit.client?.os ?? "")].filter(Boolean).join(" · ")}</p>
        </div>
        <button className="a-btn a-btn-danger-ghost" type="button" onClick={() => setConfirming(true)}>
          Delete visit
        </button>
      </div>

      {pin && (
        <div className="a-card a-map-card">
          <Suspense fallback={<p className="a-muted a-pad">Loading map…</p>}>
            <VisitMap pins={[pin]} startAtStreet compact />
          </Suspense>
        </div>
      )}

      <div className="a-grid a-grid-2 a-detail-grid">
        {GROUPS.map((group) => (
          <section key={group.title} className="a-card a-fields">
            <h2 className="a-card-title">{group.title}</h2>
            <dl>
              {group.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{show(field.value(visit))}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="a-card a-fields">
          <h2 className="a-card-title">Request headers</h2>
          <dl>
            {headers.length === 0 && <p className="a-muted">None kept.</p>}
            {headers.map(([key, value]) => (
              <div key={key}>
                <dt className="a-mono">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="a-grid a-grid-2">
        <section className="a-card a-rank">
          <h2 className="a-card-title">Events on this page</h2>
          <ol className="a-events">
            {detail.events.length === 0 && <li className="a-muted">No clicks or errors.</li>}
            {detail.events.map((event) => (
              <li key={event.id}>
                <span className={event.name === "js_error" ? "a-danger" : undefined}>
                  {EVENT_LABELS[event.name] || event.name}
                  {eventText(event) && <span className="a-event-text"> · {eventText(event)}</span>}
                </span>
                <span className="a-muted a-small">{when(event.occurred_at)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="a-card a-rank">
          <h2 className="a-card-title">Other visits from this browser</h2>
          <ol className="a-events">
            {detail.related.length === 0 && <li className="a-muted">None.</li>}
            {detail.related.map((item) => (
              <li key={item.id}>
                <Link to={`/admin/visits/${item.id}`} className="a-row-link">{item.path || "/"}</Link>
                <span className="a-muted a-small">
                  {when(item.visited_at)}
                  {place(item) ? ` · ${place(item)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {confirming && (
        <ConfirmDelete
          title="Delete this visit?"
          body="The visit and its events will be permanently deleted. This can’t be undone."
          action="Delete visit"
          onConfirm={async () => {
            await adminApi(`/api/admin/visits/${visit.id}`, token, { method: "DELETE" });
            navigate("/admin", { replace: true });
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </main>
  );
}
