/** Canonical origin for this site. Social tags in index.html use the same origin. */
export const SITE_URL = "https://huddlepals.com";

/** Support address. Privacy and terms substitute this for {{CONTACT_EMAIL}}. */
export const CONTACT_EMAIL = "hello@huddlepals.com";

/**
 * Numeric App Store ID from App Store Connect.
 * Replace XXXXXXXXXX before launch. This is the only copy of the ID:
 * STORE_URL is built from it, and the Safari Smart App Banner in index.html
 * is filled from it when the site is built.
 */
export const APP_STORE_ID = "XXXXXXXXXX";

/** App Store product page. Derived from APP_STORE_ID. */
export const STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

export const TAGLINE = "One photo a day. Just your people.";
