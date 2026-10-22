import { useEffect } from "react";
import { SITE_URL } from "./config";

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", description);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const path = window.location.pathname;
      canonical.setAttribute("href", `${SITE_URL}${path === "/" ? "/" : path}`);
    }
  }, [title, description]);
}
