import { BetaNote, DownloadButton } from "../components/DownloadButton";
import { usePageMeta } from "../usePageMeta";

export function Home() {
  usePageMeta(
    "HuddlePals — One photo a day. Just your people.",
    "HuddlePals is a private photo app for groups of 2 to 8. Post one photo a day, unlock everyone else's, and keep a shared streak. Photos are end-to-end encrypted. iOS 17+.",
  );

  return (
    <div className="home">
      <div className="home-art">
        <picture>
          <source
            media="(min-width: 960px) and (min-height: 700px)"
            srcSet="/hero.webp"
            type="image/webp"
          />
          <img src="/logo.webp" alt="" width={458} height={327} />
        </picture>
      </div>
      <div className="home-copy">
        <h1>HuddlePals</h1>
        <p className="home-tagline">One photo a day. Just your people.</p>
        <p className="home-pitch">Post yours to see theirs.</p>
        <DownloadButton />
        <BetaNote />
      </div>
    </div>
  );
}
