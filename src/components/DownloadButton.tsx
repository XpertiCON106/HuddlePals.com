import { DOWNLOAD_URL, IN_BETA } from "../config";

/**
 * Download call to action. While IN_BETA it is a text button to the public
 * TestFlight beta (Apple's App Store badge is not used for TestFlight).
 * Otherwise it is the official Download on the App Store badge, whose artwork
 * is Apple's and is not restyled.
 */
export function DownloadButton() {
  if (IN_BETA) {
    return (
      <a
        className="store-badge beta-button"
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Join the beta on TestFlight"
      >
        Join the beta<span className="beta-extra"> on TestFlight</span>
      </a>
    );
  }
  return (
    <a className="store-badge" href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
      <img
        src="/app-store-badge.svg"
        alt="Download on the App Store"
        width={119.66407}
        height={40}
      />
    </a>
  );
}

/** One-line install note shown next to the button while IN_BETA. */
export function BetaNote() {
  if (!IN_BETA) return null;
  return (
    <p className="beta-note">
      HuddlePals is in beta. Install TestFlight from the App Store, then tap the link to join.
    </p>
  );
}
