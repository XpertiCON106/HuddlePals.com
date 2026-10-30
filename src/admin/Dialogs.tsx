import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { adminApi } from "./api";

const CONFIRM_WORD = "DELETE";

function Modal({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="a-backdrop" role="presentation" onClick={onClose}>
      <div className="a-card a-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** One confirm step before a delete. Calls `onConfirm` and closes when it resolves. */
export function ConfirmDelete({
  title,
  body,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  async function run() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }
  return (
    <Modal labelledBy="a-confirm-title" onClose={() => !busy && onClose()}>
      <h2 id="a-confirm-title" className="a-dialog-title">{title}</h2>
      <p className="a-muted">{body}</p>
      {error && <p className="a-danger a-small" role="alert">{error}</p>}
      <div className="a-dialog-actions">
        <button className="a-btn a-btn-ghost" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button ref={confirmRef} className="a-btn a-btn-danger" type="button" onClick={() => void run()} disabled={busy}>
          {busy ? "Deleting…" : action}
        </button>
      </div>
    </Modal>
  );
}

/** "Clear all analytics": the delete button only enables after typing DELETE. */
export function ClearAllDialog({ token, onClose, onCleared }: { token: string; onClose: () => void; onCleared: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (typed !== CONFIRM_WORD || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi(`/api/admin/analytics?confirm=${CONFIRM_WORD}`, token, { method: "DELETE" });
      onCleared();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not clear analytics");
    }
  }

  return (
    <Modal labelledBy="a-clear-title" onClose={() => !busy && onClose()}>
      <form onSubmit={submit}>
        <h2 id="a-clear-title" className="a-dialog-title">Clear all analytics?</h2>
        <p className="a-muted">
          This permanently deletes every visit, event, session, visitor and IP lookup. App accounts and huddles aren’t affected.
        </p>
        <label className="a-confirm-field">
          <span>
            Type <code>{CONFIRM_WORD}</code> to confirm
          </span>
          <input
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        {error && <p className="a-danger a-small" role="alert">{error}</p>}
        <div className="a-dialog-actions">
          <button className="a-btn a-btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="a-btn a-btn-danger" type="submit" disabled={typed !== CONFIRM_WORD || busy}>
            {busy ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
