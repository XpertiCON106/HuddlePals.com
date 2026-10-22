/** Canonical origin for this site. Social tags in index.html use the same origin. */
export const SITE_URL = "https://huddlepals.com";

/** Support address. Privacy and terms substitute this for {{CONTACT_EMAIL}}. */
export const CONTACT_EMAIL = "hello@huddlepals.com";

/**
 * Numeric App Store ID from App Store Connect.
 * Replace XXXXXXXXXX before launch. This is the only copy of the ID:
 * STORE_URL is built from it, and the Safari Smart App Banner in index.html
 * is filled from it when the site is built. The banner is left out of the
 * build while this is still the placeholder (or not all digits).
 */
export const APP_STORE_ID = "XXXXXXXXXX";

/** App Store product page. Derived from APP_STORE_ID. */
export const STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** Public TestFlight beta invite. Used while App Store review is pending. */
export const TESTFLIGHT_URL = "https://testflight.apple.com/join/eFWghMfG";

/**
 * Where every download button points.
 * "testflight": "Join the beta on TestFlight" buttons linking to TESTFLIGHT_URL.
 * "appstore": the official App Store badge linking to STORE_URL.
 * Switch to "appstore" once the app is approved and APP_STORE_ID is set.
 */
export const DOWNLOAD_CHANNEL: "testflight" | "appstore" = "testflight";

/** Download link for the active channel. */
export const DOWNLOAD_URL = DOWNLOAD_CHANNEL === "testflight" ? TESTFLIGHT_URL : STORE_URL;

/** True while downloads go through the TestFlight beta. */
export const IN_BETA = DOWNLOAD_CHANNEL === "testflight";

export const TAGLINE = "One photo a day. Just your people.";
