import { useEffect, useState } from "react";
import { BetaNote, DownloadButton } from "../components/DownloadButton";
import { usePageMeta } from "../usePageMeta";

function readInviteFromHash() {
  if (typeof window === "undefined") {
    return { code: "", shown: "" };
  }
  const raw = window.location.hash.replace(/^#/, "");
  const code = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const shown = code.match(/.{1,4}/g)?.join("-") ?? "";
  return { code, shown };
}

export function Join() {
  usePageMeta(
    "You're invited — HuddlePals",
    "You've been invited to a private huddle on HuddlePals: one photo a day, just your people.",
  );

  const [{ code, shown }, setInvite] = useState(readInviteFromHash);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setInvite(readInviteFromHash());
      setCopied(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleCopy = () => {
    if (!shown) return;
    navigator.clipboard.writeText(shown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (!code) {
    return (
      <div className="page support join">
        <h1>This invite link is incomplete</h1>
        <p className="lede">
          Ask whoever invited you to send the link again. Invite links look like
          huddlepals.com/join#… with a long code at the end.
        </p>
        <DownloadButton />
        <BetaNote />
      </div>
    );
  }

  return (
    <div className="page support join">
      <h1>You're invited to a huddle</h1>
      <p className="lede">
        Someone invited you to their huddle on HuddlePals, a private photo app for small groups.
        Everyone posts one photo a day, and you see theirs once you post yours.
      </p>
      <p className="join-open">
        <a className="beta-button join-primary" href={`huddlepal://join/${code}`}>
          Open in HuddlePals
        </a>
      </p>

      <div className="faq">
        <article>
          <h2>Don't have the app yet?</h2>
          <DownloadButton />
          <BetaNote />
        </article>
        <article>
          <h2>Your invite code</h2>
          <div className="invite-code-row">
            <code className="invite-code">{shown}</code>
            <button type="button" className="copy-code-button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <p className="invite-instructions">
            Once HuddlePals is installed, open it, sign in, tap + and choose Join with a code, then
            paste the code. Or come back and tap Open in HuddlePals.
          </p>
        </article>
      </div>
    </div>
  );
}
