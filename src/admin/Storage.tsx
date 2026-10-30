import { useCallback, useEffect, useState } from "react";
import { adminApi } from "./api";
import { useAdmin } from "./AdminApp";
import { fmt } from "./format";

type Note = { level: "warn" | "alert"; text: string };
type StorageData = {
  limits: { storageBytes: number; databaseBytes: number; requestsPerDay: number };
  supabase: {
    bucket: string;
    storage_bytes: number;
    storage_files: number;
    folders: { folder: string; files: number; bytes: number }[];
    all_buckets_bytes: number;
    database_bytes: number;
  };
  cloudflare: { connected: boolean; error: string; requests: { today: number; last30: number } | null };
  notes: Note[];
};

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function Meter({ label, used, limit, text, note }: { label: string; used: number; limit: number; text: string; note?: string }) {
  const share = limit > 0 ? used / limit : 0;
  const percent = Math.min(100, share * 100);
  const level = share >= 0.9 ? " is-alert" : share >= 0.7 ? " is-warn" : "";
  return (
    <div className="a-card a-meter-card">
      <div className="a-meter-head">
        <p className="a-stat-label">{label}</p>
        <p className="a-muted a-small">{percent < 1 && used > 0 ? "<1" : Math.round(percent)}%</p>
      </div>
      <p className="a-meter-value">{text}</p>
      <div
        className={`a-meter${level}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {note && <p className="a-muted a-small">{note}</p>}
    </div>
  );
}

export function StoragePage() {
  const { token } = useAdmin();
  const [data, setData] = useState<StorageData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    adminApi<StorageData>("/api/admin/storage", token)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load usage"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  const s = data?.supabase;
  const limits = data?.limits;
  const cf = data?.cloudflare;

  return (
    <main className="a-wrap a-main">
      <section className="a-section" aria-labelledby="a-storage">
        <div className="a-heading-row">
          <div>
            <p className="a-eyebrow">Free plan</p>
            <h1 id="a-storage" className="a-title">Storage &amp; usage</h1>
          </div>
          <button className="a-btn a-btn-ghost" type="button" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error && <p className="a-danger" role="alert">{error}</p>}
      </section>

      {data && s && limits && cf && (
        <>
          <section className="a-section" aria-labelledby="a-notes-title">
            <h2 id="a-notes-title" className="a-section-title">Things to know</h2>
            <div className="a-card a-pad">
              {data.notes.length === 0 ? (
                <p className="a-muted">Nothing needs attention.</p>
              ) : (
                <ul className="a-notes">
                  {data.notes.map((note) => (
                    <li key={note.text} className={note.level === "alert" ? "a-danger" : "a-warn"}>
                      {note.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="a-section" aria-labelledby="a-supabase-title">
            <h2 id="a-supabase-title" className="a-section-title">Supabase</h2>
            <div className="a-grid a-meters">
              <Meter
                label="File storage"
                used={s.all_buckets_bytes}
                limit={limits.storageBytes}
                text={`${bytes(s.all_buckets_bytes)} of ${bytes(limits.storageBytes)}`}
                note={`${fmt.format(s.storage_files)} files in the ${s.bucket} bucket`}
              />
              <Meter
                label="Database"
                used={s.database_bytes}
                limit={limits.databaseBytes}
                text={`${bytes(s.database_bytes)} of ${bytes(limits.databaseBytes)}`}
              />
            </div>
            <div className="a-card a-table-card">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Folder</th>
                    <th>Files</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {s.folders.map((row) => (
                    <tr key={row.folder}>
                      <td data-label="Folder" className="a-mono">{row.folder}</td>
                      <td data-label="Files">{fmt.format(row.files)}</td>
                      <td data-label="Size">{bytes(row.bytes)}</td>
                    </tr>
                  ))}
                  {s.folders.length === 0 && (
                    <tr className="a-empty-row">
                      <td colSpan={3} className="a-muted">No files yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="a-section" aria-labelledby="a-cf-title">
            <h2 id="a-cf-title" className="a-section-title">Cloudflare</h2>
            {!cf.connected ? (
              <p className="a-muted a-card a-pad">Not connected. Add a read-only analytics token to show Worker requests.</p>
            ) : cf.error || !cf.requests ? (
              <p className="a-danger a-card a-pad">{cf.error || "Could not load Worker requests"}</p>
            ) : (
              <div className="a-grid a-meters">
                <Meter
                  label="Worker requests today"
                  used={cf.requests.today}
                  limit={limits.requestsPerDay}
                  text={`${fmt.format(cf.requests.today)} of ${fmt.format(limits.requestsPerDay)}`}
                  note="All Workers on the account. Resets at midnight UTC."
                />
                <div className="a-card a-stat">
                  <p className="a-stat-label">Worker requests, last 30 days</p>
                  <p className="a-stat-value">{fmt.format(cf.requests.last30)}</p>
                  <p className="a-muted a-small">About {fmt.format(Math.round(cf.requests.last30 / 30))} a day</p>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
