export type Count = { name: string; count: number };

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  visitedAt: string;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  postalCode: string | null;
  country: string | null;
  path: string | null;
  visitorId: string | null;
  device: string;
};

export type Summary = {
  totals: {
    visits: number;
    unique: number;
    today: number;
    d7: number;
    d30: number;
    live: number;
    range: number;
    rangeUnique: number;
  };
  series: { date: string; visits: number; unique: number }[];
  countries: Count[];
  cities: Count[];
  pages: Count[];
  referrers: Count[];
  devices: Count[];
  browsers: Count[];
  os: Count[];
  pins: MapPin[];
};

export type Experience = {
  timing: { ttfb: number | null; fcp: number | null; domReady: number | null; load: number | null; samples: number };
  attention: { duration: number | null; visible: number | null; focus: number | null; scroll: number | null; samples: number };
  schemes: Count[];
  motion: Count[];
  connections: Count[];
  screens: Count[];
  hardware: Count[];
  clicks: Count[];
  outbound: Count[];
  errors: {
    count: number;
    recent: { at: string; path: string | null; visitId: string | null; kind: string | null; message: string | null; source: string | null; line: string | null }[];
  };
};

export type VisitRow = {
  id: string;
  visited_at: string;
  path: string | null;
  referrer_host: string | null;
  city: string | null;
  region: string | null;
  region_code: string | null;
  country: string | null;
  ip: string | null;
  is_vpn: boolean | null;
  is_proxy: boolean | null;
  is_tor: boolean | null;
  is_hosting: boolean | null;
  client: Record<string, unknown> | null;
  visitor_id: string | null;
  duration_ms: number | null;
  is_admin: boolean;
};

export type Visit = Record<string, unknown> & {
  id: string;
  visited_at: string;
  path: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  region_code: string | null;
  postal_code: string | null;
  country: string | null;
  visitor_id: string | null;
  client: Record<string, unknown> | null;
  headers: Record<string, string> | null;
};

export type VisitEvent = { id: string; occurred_at: string; name: string; path: string | null; props: Record<string, unknown> };
