import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi } from "./api";
import { useAdmin } from "./AdminApp";
import { ClearAllDialog, ConfirmDelete } from "./Dialogs";
import { countryName, fmt, ms, place, when } from "./format";
import { RangePicker, rangeText, type RangeValue } from "./RangePicker";
import type { Count, Experience, Summary, VisitRow } from "./types";

const VisitMap = lazy(() => import("./VisitMap"));

const PAGE_SIZE = 25;
const LIVE_POLL_MS = 20_000;
const RANGE_KEY = "hp-admin-range";

const emptySummary: Summary = {
  totals: { visits: 0, unique: 0, today: 0, d7: 0, d30: 0, live: 0, range: 0, rangeUnique: 0 },
  series: [],
  countries: [],
  cities: [],
  pages: [],
  referrers: [],
  devices: [],
  browsers: [],
  os: [],
  pins: [],
};

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function savedRange(): RangeValue {
  try {
    const value = sessionStorage.getItem(RANGE_KEY);
    if (value && ["1", "7", "30", "60", "90", "180", "365", "all"].includes(value)) return value as RangeValue;
  } catch {
    // Storage can be blocked.
  }
  return "30";
}

type PendingDelete = { ids: string[]; label: string } | null;

export function Dashboard() {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [range, setRangeState] = useState<RangeValue>(savedRange);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<PendingDelete>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selectAllRef = useRef<HTMLInputElement>(null);

  function setRange(next: RangeValue) {
    setRangeState(next);
    setPage(1);
    try {
      sessionStorage.setItem(RANGE_KEY, next);
    } catch {
      // Not remembered.
    }
  }

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      adminApi<Summary>(`/api/admin/summary?range=${range}&tz=${encodeURIComponent(timeZone)}`, token),
      adminApi<Experience>(`/api/admin/experience?range=${range}`, token),
    ])
      .then(([nextSummary, nextExperience]) => {
        if (cancelled) return;
        setSummary({ ...emptySummary, ...nextSummary, totals: { ...emptySummary.totals, ...nextSummary.totals } });
        setExperience(nextExperience);
        setLive(nextSummary.totals?.live ?? 0);
        setError("");
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, range, reload]);

  // The Live total: visits in the last five minutes, polled while the tab is visible.
  useEffect(() => {
    let timer = 0;
    const poll = () => {
      if (document.visibilityState === "visible") {
        adminApi<{ live: number }>("/api/admin/live", token)
          .then((data) => setLive(data.live))
          .catch(() => {});
      }
      timer = window.setTimeout(poll, LIVE_POLL_MS);
    };
    timer = window.setTimeout(poll, LIVE_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ range, page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    if (includeAdmin) params.set("includeAdmin", "true");
    return params.toString();
  }, [range, page, search, includeAdmin]);

  useEffect(() => {
    let cancelled = false;
    adminApi<{ visits: VisitRow[]; total: number }>(`/api/admin/visits?${query}`, token)
      .then((data) => {
        if (cancelled) return;
        setVisits(data.visits);
        setTotal(data.total);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [query, token, reload]);

  // Ticks only cover rows on the current page; drop ticks for rows no longer shown.
  useEffect(() => {
    setSelected((prev) => {
      const shown = new Set(visits.map((visit) => visit.id));
      const next = new Set([...prev].filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visits]);

  const allSelected = visits.length > 0 && visits.every((visit) => selected.has(visit.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
  }, [selected, allSelected]);

  function toggleRow(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmDelete(ids: string[]) {
    if (ids.length === 1) await adminApi(`/api/admin/visits/${ids[0]}`, token, { method: "DELETE" });
    else await adminApi("/api/admin/visits/delete", token, { method: "POST", body: JSON.stringify({ ids }) });
    setSelected(new Set());
    refresh();
  }

  async function exportCsv() {
    const params = new URLSearchParams({ range });
    if (search) params.set("q", search);
    if (includeAdmin) params.set("includeAdmin", "true");
    const response = await fetch(`/api/admin/export.csv?${params}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      setError("Could not export visits");
      return;
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "huddlepals-visits.csv";
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totals = summary.totals;
  const rangeWords = rangeText(range);

  return (
    <main className="a-wrap a-main">
      <section className="a-section" aria-labelledby="a-overview">
        <div className="a-heading-row">
          <div>
            <p className="a-eyebrow">huddlepals.com</p>
            <h1 id="a-overview" className="a-title">Visitors</h1>
          </div>
          <button className="a-btn a-btn-ghost" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error && <p className="a-danger" role="alert">{error}</p>}
        <div className="a-stats">
          <Stat label="Today" value={fmt.format(totals.today)} />
          <Stat label="7 days" value={fmt.format(totals.d7)} />
          <Stat label="30 days" value={fmt.format(totals.d30)} />
          <Stat
            label={
              <span className="a-live-label">
                <span className={`a-live-dot${live ? " is-on" : ""}`} aria-hidden="true" />
                Live
              </span>
            }
            value={live == null ? "—" : fmt.format(live)}
            note="last 5 minutes"
          />
        </div>
        <p className="a-muted a-small">Your own visits are left out of every number.</p>
      </section>

      <div className="a-range-bar">
        <p className="a-muted">
          Showing <strong>{rangeWords}</strong> · {fmt.format(totals.range)} visits · {fmt.format(totals.rangeUnique)} unique
        </p>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <section className="a-card a-chart-card" aria-labelledby="a-chart-title">
        <h2 id="a-chart-title" className="a-card-title">Visits over time</h2>
        <Chart series={summary.series} range={range} />
      </section>

      <section className="a-grid a-grid-3" aria-label="Breakdowns">
        <Rank title="Pages" rows={summary.pages} />
        <Rank title="Referrers" rows={summary.referrers} empty="No referrers yet." />
        <Rank title="Countries" rows={summary.countries.map((row) => ({ ...row, name: countryName(row.name) || row.name }))} />
        <Rank title="Cities" rows={summary.cities} />
        <Rank title="Devices" rows={summary.devices} />
        <Rank title="Browsers" rows={summary.browsers} />
        <Rank title="Operating systems" rows={summary.os} />
      </section>

      <section className="a-section" aria-labelledby="a-map-title">
        <h2 id="a-map-title" className="a-section-title">Map</h2>
        <p className="a-muted a-small">
          Approximate places from Cloudflare’s IP location, {rangeWords}. Click a dot to zoom in.
        </p>
        <div className="a-card a-map-card">
          <Suspense fallback={<p className="a-muted a-pad">Loading map…</p>}>
            <VisitMap pins={summary.pins} onSelect={(pin) => navigate(`/admin/visits/${pin.id}`)} />
          </Suspense>
        </div>
      </section>

      {experience && <ExperienceSection data={experience} rangeWords={rangeWords} />}

      <section className="a-section" aria-labelledby="a-log-title">
        <div className="a-heading-row">
          <div>
            <h2 id="a-log-title" className="a-section-title">Visit log</h2>
            <p className="a-muted a-small">
              {fmt.format(total)} {total === 1 ? "visit" : "visits"} in {rangeWords}
            </p>
          </div>
          <div className="a-actions">
            <button className="a-btn a-btn-ghost" type="button" onClick={() => void exportCsv()}>
              Download CSV
            </button>
            <button className="a-btn a-btn-danger-ghost" type="button" onClick={() => setClearOpen(true)}>
              Clear all analytics
            </button>
          </div>
        </div>
        <div className="a-filters">
          <label className="a-search">
            <span className="a-sr">Search visits</span>
            <input type="search" placeholder="Search path, place, IP or referrer" value={q} onChange={(event) => setQ(event.target.value)} />
          </label>
          <label className="a-check-label">
            <input
              type="checkbox"
              checked={includeAdmin}
              onChange={(event) => {
                setPage(1);
                setIncludeAdmin(event.target.checked);
              }}
            />
            Include my visits
          </label>
        </div>
        {selected.size > 0 && (
          <div className="a-selection" role="status">
            <span>{selected.size} selected</span>
            <button className="a-btn a-btn-ghost a-btn-small" type="button" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
            <button
              className="a-btn a-btn-danger a-btn-small"
              type="button"
              onClick={() => setPending({ ids: [...selected], label: `${selected.size} ${selected.size === 1 ? "visit" : "visits"}` })}
            >
              Delete selected ({selected.size})
            </button>
          </div>
        )}
        <div className="a-card a-table-card">
          <table className="a-table">
            <thead>
              <tr>
                <th className="a-col-check">
                  <input
                    ref={selectAllRef}
                    className="a-checkbox"
                    type="checkbox"
                    aria-label="Select all visits on this page"
                    checked={allSelected}
                    disabled={visits.length === 0}
                    onChange={(event) => setSelected(event.target.checked ? new Set(visits.map((visit) => visit.id)) : new Set())}
                  />
                </th>
                <th>When</th>
                <th>Page</th>
                <th>Place</th>
                <th>Device</th>
                <th>Source</th>
                <th>IP</th>
                <th className="a-col-actions">
                  <span className="a-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => {
                const client = visit.client ?? {};
                const device = [client.browser, client.os].filter(Boolean).join(" · ") || "—";
                const flags = [visit.is_vpn && "VPN", visit.is_proxy && "Proxy", visit.is_tor && "Tor", visit.is_hosting && "Hosting"].filter(Boolean);
                return (
                  <tr key={visit.id} className={selected.has(visit.id) ? "is-selected" : undefined}>
                    <td className="a-col-check">
                      <input
                        className="a-checkbox"
                        type="checkbox"
                        aria-label={`Select visit to ${visit.path || "/"} at ${when(visit.visited_at)}`}
                        checked={selected.has(visit.id)}
                        onChange={(event) => toggleRow(visit.id, event.target.checked)}
                      />
                    </td>
                    <td data-label="When">
                      <Link to={`/admin/visits/${visit.id}`} className="a-row-link">
                        {when(visit.visited_at)}
                      </Link>
                      {visit.is_admin && <span className="a-badge">You</span>}
                    </td>
                    <td data-label="Page" className="a-mono">{visit.path || "/"}</td>
                    <td data-label="Place">{place(visit) || "—"}</td>
                    <td data-label="Device">{device}</td>
                    <td data-label="Source">{visit.referrer_host || "Direct"}</td>
                    <td data-label="IP" className="a-mono">
                      {visit.ip || "—"}
                      {flags.map((flag) => (
                        <span key={String(flag)} className="a-badge">{flag}</span>
                      ))}
                    </td>
                    <td className="a-col-actions">
                      <button
                        className="a-btn a-btn-danger-ghost a-btn-small"
                        type="button"
                        aria-label={`Delete visit to ${visit.path || "/"} at ${when(visit.visited_at)}`}
                        onClick={() => setPending({ ids: [visit.id], label: "this visit" })}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visits.length === 0 && (
                <tr className="a-empty-row">
                  <td colSpan={8} className="a-muted">
                    No visits in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="a-pager">
          <span className="a-muted a-small">
            Page {page} of {pages}
          </span>
          <div className="a-actions">
            <button className="a-btn a-btn-ghost a-btn-small" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              Previous
            </button>
            <button className="a-btn a-btn-ghost a-btn-small" type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>

      {pending && (
        <ConfirmDelete
          title={pending.ids.length === 1 ? "Delete this visit?" : `Delete ${pending.label}?`}
          body={`${pending.ids.length === 1 ? "The visit and its events" : "These visits and their events"} will be permanently deleted. This can’t be undone.`}
          action={pending.ids.length === 1 ? "Delete visit" : `Delete ${pending.ids.length} visits`}
          onConfirm={() => confirmDelete(pending.ids)}
          onClose={() => setPending(null)}
        />
      )}
      {clearOpen && (
        <ClearAllDialog
          token={token}
          onClose={() => setClearOpen(false)}
          onCleared={() => {
            setSelected(new Set());
            setPage(1);
            refresh();
          }}
        />
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: ReactNode; value: string; note?: string }) {
  return (
    <div className="a-card a-stat">
      <p className="a-stat-label">{label}</p>
      <p className="a-stat-value">{value}</p>
      {note && <p className="a-muted a-small">{note}</p>}
    </div>
  );
}

function Rank({ title, rows, empty = "No data yet." }: { title: string; rows: Count[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="a-card a-rank">
      <h3 className="a-card-title">{title}</h3>
      <ul>
        {rows.length === 0 && <li className="a-muted">{empty}</li>}
        {rows.slice(0, 8).map((row) => (
          <li key={row.name}>
            <span className="a-rank-bar" style={{ width: `${(row.count / max) * 100}%` }} aria-hidden="true" />
            <span className="a-rank-name" title={row.name}>{row.name}</span>
            <span className="a-rank-count">{fmt.format(row.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bucketLabel(date: string, range: RangeValue, short: boolean): string {
  if (date.includes("T")) {
    const hour = Number(date.slice(11, 13));
    return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
  }
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  const weekly = range === "all" || range === "365";
  const text = value.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(short ? {} : { year: "numeric" }) });
  return weekly && !short ? `Week of ${text}` : text;
}

/** Bars for visits per bucket, with unique visitors drawn inside each bar. */
function Chart({ series, range }: { series: Summary["series"]; range: RangeValue }) {
  if (series.length === 0) return <p className="a-muted a-chart-empty">No visits in this range.</p>;
  const max = Math.max(1, ...series.map((point) => point.visits));
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((value, index, list) => list.indexOf(value) === index);
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  return (
    <figure className="a-chart">
      <div className="a-chart-y" aria-hidden="true">
        <span>{fmt.format(top)}</span>
        <span>{fmt.format(Math.round(top / 2))}</span>
        <span>0</span>
      </div>
      <div className="a-chart-plot">
        <div className="a-chart-bars" role="img" aria-label={`Visits per ${series[0].date.includes("T") ? "hour" : range === "all" || range === "365" ? "week" : "day"}, highest ${max}`}>
          {series.map((point) => (
            <div key={point.date} className="a-chart-col" title={`${bucketLabel(point.date, range, false)}: ${point.visits} visits, ${point.unique} unique`}>
              <span className="a-chart-bar" style={{ height: `${(point.visits / top) * 100}%` }}>
                <span className="a-chart-unique" style={{ height: point.visits ? `${(point.unique / point.visits) * 100}%` : 0 }} />
              </span>
            </div>
          ))}
        </div>
        <div className="a-chart-x" aria-hidden="true">
          {ticks.map((index) => (
            <span key={index} style={{ left: `${((index + 0.5) / series.length) * 100}%` }}>
              {bucketLabel(series[index].date, range, true)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="a-chart-legend">
        <span><i className="a-key a-key-visits" /> Visits</span>
        <span><i className="a-key a-key-unique" /> Unique visitors</span>
      </figcaption>
    </figure>
  );
}

function ExperienceSection({ data, rangeWords }: { data: Experience; rangeWords: string }) {
  const { timing, attention, errors } = data;
  return (
    <section className="a-section" aria-labelledby="a-exp-title">
      <h2 id="a-exp-title" className="a-section-title">Experience</h2>
      <p className="a-muted a-small">How pages loaded and how long people stayed, {rangeWords}. Medians.</p>
      <div className="a-stats a-stats-5">
        <Stat label="First paint" value={ms(timing.fcp)} note={`${fmt.format(timing.samples)} loads · TTFB ${ms(timing.ttfb)}`} />
        <Stat label="Page load" value={ms(timing.load)} note={`DOM ready ${ms(timing.domReady)}`} />
        <Stat label="Time on page" value={ms(attention.duration)} note={`${fmt.format(attention.samples)} pages`} />
        <Stat label="Visible time" value={ms(attention.visible)} note={`focused ${ms(attention.focus)}`} />
        <Stat label="Scroll depth" value={attention.scroll == null ? "—" : `${Math.round(attention.scroll)}%`} note="average" />
      </div>
      <div className="a-grid a-grid-4">
        <Rank title="Color scheme" rows={data.schemes} />
        <Rank title="Motion" rows={data.motion} />
        <Rank title="Connection" rows={data.connections} />
        <Rank title="Screens" rows={data.screens} />
        <Rank title="Hardware" rows={data.hardware} />
        <Rank title="Clicks" rows={data.clicks} />
        <Rank title="Outbound links" rows={data.outbound} empty="No outbound clicks yet." />
        <div className="a-card a-rank">
          <h3 className="a-card-title">Script errors</h3>
          <p className="a-muted a-small">{fmt.format(errors.count)} in this range</p>
          <ul className="a-errors">
            {errors.recent.length === 0 && <li className="a-muted">No errors.</li>}
            {errors.recent.map((item, index) => (
              <li key={`${item.at}-${index}`}>
                {item.visitId ? (
                  <Link to={`/admin/visits/${item.visitId}`} className="a-danger">{item.message || "Unknown error"}</Link>
                ) : (
                  <span className="a-danger">{item.message || "Unknown error"}</span>
                )}
                <span className="a-muted a-small">
                  {when(item.at)} · {item.path || "/"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
