import { STORE_URL } from "../config";

/** Official Download on the App Store badge. The artwork is Apple's and is not restyled. */
export function AppStoreBadge() {
  return (
    <a className="store-badge" href={STORE_URL} target="_blank" rel="noopener noreferrer">
      <img
        src="/app-store-badge.svg"
        alt="Download on the App Store"
        width={119.66407}
        height={40}
      />
    </a>
  );
}
