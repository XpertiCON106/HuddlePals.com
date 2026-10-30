const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames("en", { type: "region" }) : null;

/** "US" → "United States". */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function place(visit: { city?: string | null; region_code?: string | null; region?: string | null; country?: string | null }): string {
  const code = visit.region_code && /^[A-Z]{1,3}$/.test(visit.region_code) ? visit.region_code : null;
  const parts = [visit.city, code || (visit.city ? null : visit.region), visit.country].filter(Boolean);
  return parts.join(", ");
}

export function when(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

export const fmt = new Intl.NumberFormat("en-US");
