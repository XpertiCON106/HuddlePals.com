import { Link } from "react-router-dom";
import { DownloadButton } from "../components/DownloadButton";
import { CONTACT_EMAIL, IN_BETA } from "../config";
import { usePageMeta } from "../usePageMeta";

const REMOVAL_SUBJECT = "Intimate image removal request";

export function Support() {
  usePageMeta(
    "Support — HuddlePals",
    "Get help with HuddlePals: download the app, start or join a huddle, delete your account, report a photo, or ask us to remove an intimate image shared without consent.",
  );

  return (
    <div className="page support">
      <h1>Support</h1>
      <p className="lede">Questions about the app, your huddle, or your account.</p>
      <p className="contact-line">
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <section className="takedown" aria-labelledby="takedown-title">
        <h2 id="takedown-title">Report an intimate image shared without consent</h2>
        <p>
          If an intimate image of you, or of someone you are authorized to act for, was shared on
          HuddlePals without consent, you can ask us to remove it, whether or not you have an
          account. Report the photo or video in the app, or email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REMOVAL_SUBJECT)}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          with the subject “{REMOVAL_SUBJECT}.”
        </p>
        <p>
          Include your physical or electronic signature, enough information to find the image (such
          as the huddle, the date, and the poster’s display name), a brief statement that you
          believe in good faith it was shared without consent, and how we can contact you. We
          remove the image as soon as possible, and no later than 48 hours after we receive a valid
          request. If the person shown is under 18, NCMEC’s{" "}
          <a href="https://takeitdown.ncmec.org">Take It Down</a> service can also help. Details
          are in Section 5.3 of the <Link to="/terms">Terms of Service</Link>.
        </p>
      </section>

      <div className="faq">
        <article>
          <h2>How do I download it?</h2>
          {IN_BETA ? (
            <p>
              HuddlePals is in beta on TestFlight. You need an iPhone running iOS 17 or later.
              Install TestFlight from the App Store, then tap the link below to join the beta.
              Open HuddlePals and sign in with Apple.
            </p>
          ) : (
            <p>
              HuddlePals is on the App Store. You need an iPhone running iOS 17 or later. Download
              the app, open it, and sign in with Apple.
            </p>
          )}
          <DownloadButton />
        </article>
        <article>
          <h2>How do I start or join a huddle?</h2>
          <p>
            A huddle is a private group of up to 4 people, or up to 10 when the person who keeps it
            has HuddlePals+. After you sign in, start a huddle and send the invite to the people
            you want in it, or open an invite someone sent you. Its photos and videos are
            end-to-end encrypted for the huddle’s members. We generally cannot view a photo or video
            unless a member reports it.
          </p>
        </article>
        <article>
          <h2>What is HuddlePals+?</h2>
          <p>
            HuddlePals is free, and everyone you invite joins free. HuddlePals+ is an optional
            subscription, monthly or yearly. With it, the huddles you keep can grow to 10 people,
            you can keep up to 10 huddles, you can post a 6-second video instead of a photo, and you
            can open every past day in your huddles. Get it in the app under Profile → Plan.
          </p>
        </article>
        <article>
          <h2>How do I cancel or restore HuddlePals+?</h2>
          <p>
            Cancel any time in your iPhone’s Settings → your name → Subscriptions, or in the app
            under Profile → Plan → Manage subscription. Plus stays on until the end of the period
            you’ve paid for, and nothing in your huddles is deleted when it ends. Deleting your
            HuddlePals account doesn’t cancel it, so cancel first. Apple handles payments and
            refunds: ask Apple for a refund at{" "}
            <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>. On a new phone,
            tap Restore Purchases in Profile → Plan.
          </p>
        </article>
        <article>
          <h2>How do I delete my account?</h2>
          <p>
            In the app, go to Profile → Delete account. Deleting your account permanently removes
            your login, display name, bio, profile photos, and encryption keys, and signs you out.
            Photos and videos you already deposited stay in the huddle, shown as “Former member,” so
            the group’s album stays intact. Deleting your account doesn’t cancel HuddlePals+:
            cancel it first in Settings → your name → Subscriptions. To ask about a specific photo
            or video, email us.
          </p>
        </article>
        <article>
          <h2>How do I report a photo?</h2>
          <p>
            Open the ••• menu on a photo or video and report it. You can block someone from that
            same menu, or from their profile. Blocking hides that person’s photos, videos, and
            comments from you. We review reports.
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
      <DownloadButton />
    </div>
  );
}
