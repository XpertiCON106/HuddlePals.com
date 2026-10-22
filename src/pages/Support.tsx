import { Link } from "react-router-dom";
import { AppStoreBadge } from "../components/AppStoreBadge";
import { CONTACT_EMAIL } from "../config";
import { usePageMeta } from "../usePageMeta";

export function Support() {
  usePageMeta(
    "Support — HuddlePals",
    "Get help with HuddlePals: download the app, start or join a huddle, delete your account, or report a photo.",
  );

  return (
    <div className="page support">
      <h1>Support</h1>
      <p className="lede">Questions about the app, your huddle, or your account.</p>
      <p className="contact-line">
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <div className="faq">
        <article>
          <h2>How do I download it?</h2>
          <p>
            HuddlePals is on the App Store. You need an iPhone running iOS 17 or later. Download
            the app, open it, and sign in with Apple.
          </p>
          <AppStoreBadge />
        </article>
        <article>
          <h2>How do I start or join a huddle?</h2>
          <p>
            A huddle is a private group of 2 to 8 people. After you sign in, start a huddle and
            send the invite to the people you want in it, or open an invite someone sent you. Only
            members of that huddle can see its photos.
          </p>
        </article>
        <article>
          <h2>How do I delete my account?</h2>
          <p>
            In the app, go to Profile → Delete account. Deleting your account permanently removes
            your login, display name, bio, profile photos, and encryption keys, and signs you out.
            Photos you already deposited stay in the huddle, shown as “Former member,” so the
            group’s album stays intact. To ask about a specific photo, email us.
          </p>
        </article>
        <article>
          <h2>How do I report a photo?</h2>
          <p>
            Open the ••• menu on a photo and report it. You can block someone from that same menu,
            or from their profile. Blocking hides that person’s photos and comments from you. We
            review reports.
          </p>
        </article>
        <article>
          <h2>How do I contact you?</h2>
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We read every message.
          </p>
        </article>
      </div>

      <p className="fine">
        How we handle photos and account data is in the <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <AppStoreBadge />
    </div>
  );
}
