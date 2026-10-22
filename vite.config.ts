import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function readAppStoreId(): string {
  const source = readFileSync(new URL("./src/config.ts", import.meta.url), "utf8");
  const match = source.match(/export const APP_STORE_ID = "([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("APP_STORE_ID is missing from src/config.ts");
  }
  return match[1];
}

/**
 * Writes the Smart App Banner app-id from APP_STORE_ID into index.html.
 * While APP_STORE_ID is still the placeholder (not all digits), the banner
 * meta tag is removed so Safari never shows a banner for a missing app.
 */
function appleSmartBanner(): Plugin {
  const appStoreId = readAppStoreId();
  const hasRealId = /^\d+$/.test(appStoreId);
  return {
    name: "apple-smart-banner",
    transformIndexHtml(html) {
      if (!html.includes("__APP_STORE_ID__")) {
        throw new Error("index.html is missing the __APP_STORE_ID__ smart banner placeholder");
      }
      if (!hasRealId) {
        return html.replace(/[ \t]*<meta name="apple-itunes-app"[^>]*>\r?\n?/g, "");
      }
      return html.replaceAll("__APP_STORE_ID__", appStoreId);
    },
  };
}

export default defineConfig({
  plugins: [react(), appleSmartBanner()],
});
