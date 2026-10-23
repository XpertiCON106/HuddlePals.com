import { BetaNote, DownloadButton } from "../components/DownloadButton";
import { IN_BETA } from "../config";
import { usePageMeta } from "../usePageMeta";

const steps = [
  {
    n: "1",
    color: "#F76B15",
    title: "Post one photo a day",
    body: "Camera only. One picture from you, each day.",
  },
  {
    n: "2",
    color: "#E5484D",
    title: "Unlock everyone’s",
    body: "Their photos stay blurred until you post yours.",
  },
  {
    n: "3",
    color: "#D6409F",
    title: "Keep the streak together",
    body: "The group shares one streak. Show up, and it grows.",
  },
  {
    n: "4",
    color: "#1C1917",
    title: "Encrypted photos",
    body: "Photos are end-to-end encrypted, and they stay. The huddle is your shared album.",
  },
];

export function About() {
  usePageMeta(
    "About — HuddlePals",
    `HuddlePals is a private photo app for small groups. Post one photo a day, unlock everyone else's, and keep a shared streak. ${IN_BETA ? "In beta on TestFlight" : "On the App Store"} for iPhone.`,
  );

  return (
    <div className="about">
      <h1>About</h1>
      <p className="lede">
        HuddlePals is a private photo app for a small group of people you actually know. Everyone
        posts one photo a day, from the camera only. The others stay blurred until you post yours,
        and the group keeps a streak together. Photos are end-to-end encrypted and permanent, so
        the huddle becomes your shared album.
      </p>
      <p className="cta-note">For iPhone. Requires iOS 17 or later.</p>
      <ul className="chips">
        <li>Sign in with Apple</li>
        <li>Groups of 2–8</li>
        <li>Camera only</li>
        <li>End-to-end encrypted photos</li>
      </ul>

      <section>
        <h2>How it works</h2>
        <p className="lede">A private group of two to eight. Everyone posts one photo a day.</p>
        <div className="steps">
          {steps.map((step) => (
            <article className="step" key={step.n}>
              <span className="num" style={{ background: step.color }}>
                {step.n}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="spotlight">
        <div>
          <h2>Theirs stay blurred.</h2>
          <p>
            Until your photo for the day is in, the rest of the huddle stays locked. Post yours,
            and everyone’s pictures come into focus. One picture each, just the people you invited.
          </p>
        </div>
        <img
          src="/card.webp"
          width={960}
          height={640}
          alt="Post yours to see theirs. Photo cards for you and Sam, with a 7-day streak."
        />
      </section>

      <section className="closing">
        <h2>Your people. One photo a day.</h2>
        <DownloadButton />
        <BetaNote />
      </section>
    </div>
  );
}
