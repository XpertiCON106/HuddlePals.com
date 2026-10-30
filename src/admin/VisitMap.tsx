import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { countryName } from "./format";
import type { MapPin } from "./types";

// Map styles. All are free tile sources that need no API key; each carries its own attribution.
// "invert" styles get the dark-mode tile inversion in CSS (only the standard OSM look).
type MapStyle = { id: string; label: string; url: string; attribution: string; maxNativeZoom: number; invert?: boolean; subdomains?: string };
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';
const ARCGIS = "https://server.arcgisonline.com/ArcGIS/rest/services";
const STYLES: MapStyle[] = [
  { id: "standard", label: "OSM Standard", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM, maxNativeZoom: 19, invert: true },
  { id: "light", label: "Light gray", url: `${ARCGIS}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attribution: `${ESRI} &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors`, maxNativeZoom: 16 },
  { id: "dark", label: "Dark gray", url: `${ARCGIS}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attribution: `${ESRI} &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors`, maxNativeZoom: 16 },
  { id: "satellite", label: "Imagery", url: `${ARCGIS}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution: `${ESRI} &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community`, maxNativeZoom: 18 },
  { id: "terrain", label: "Topographic", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", subdomains: "abc", attribution: `Map data: ${OSM}, SRTM &mdash; Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`, maxNativeZoom: 17 },
];
const STYLE_KEY = "hp-admin-map-style";

function savedStyle(): MapStyle {
  let id: string | null = null;
  try {
    id = localStorage.getItem(STYLE_KEY);
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return STYLES.find((style) => style.id === id) ?? STYLES[0];
}

function tileLayer(style: MapStyle) {
  return L.tileLayer(style.url, {
    attribution: style.attribution,
    maxZoom: 19,
    maxNativeZoom: style.maxNativeZoom,
    subdomains: style.subdomains ?? "abc",
    // The admin page sends no referrer cross-origin, but OpenStreetMap's tile policy
    // requires one; send the bare origin only (never the /admin path).
    referrerPolicy: "strict-origin",
    // Keep nearby tiles and skip loading mid-zoom, so zooming does not flash blank tiles.
    keepBuffer: 6,
    updateWhenZooming: false,
  });
}

// The whole-world view the map opens on, and the "Zoom out" target.
const HOME_CENTER: L.LatLngTuple = [18, 10];
const HOME_ZOOM = 2;

// Zoom levels offered after a dot is clicked. A click flies to Street.
const STREET_ZOOM = 15;
const LEVELS = [
  { label: "Street", zoom: STREET_ZOOM },
  { label: "City", zoom: 11 },
  { label: "Region", zoom: 7 },
  { label: "Country", zoom: 5 },
];
const CLICK_ZOOM = STREET_ZOOM;
// Zoom used to name a place in titles and labels ("San Jose, CA").
const CITY_ZOOM = 11;

type Focus = { pin: MapPin; zoom: number };

/**
 * Names the place for a zoom level from the visit's stored location, with no geocoding.
 * Each level falls back to the next broader one when a field is missing.
 */
function placeLabel(pin: MapPin, zoom: number): string {
  const country = countryName(pin.country) || "Unknown place";
  // Some countries use numeric region codes ("01"), which read as noise in a label.
  const code = pin.regionCode && /^[A-Z]{1,3}$/.test(pin.regionCode) ? pin.regionCode : null;
  const region = pin.region || code || country;
  const city = pin.city ? [pin.city, code || pin.country].filter(Boolean).join(", ") : region;
  const street =
    pin.city && pin.postalCode
      ? `${pin.city}, ${[code, pin.postalCode].filter(Boolean).join(" ")}`
      : city;
  if (zoom >= 15) return street;
  if (zoom >= 11) return city;
  if (zoom >= 7) return region;
  return country;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// A slow, eased flight reads as one smooth move instead of a jump.
const FLY = { duration: 1.5, easeLinearity: 0.2 };

/** Moves the map. Flies when motion is fine, jumps when the user prefers reduced motion. */
function moveTo(map: L.Map, center: L.LatLngExpression, zoom: number) {
  if (reducedMotion()) map.setView(center, zoom, { animate: false });
  else map.flyTo(center, zoom, FLY);
}

type Props = {
  pins: MapPin[];
  onSelect?: (pin: MapPin) => void;
  /** Open zoomed to Street level on the first pin, with the zoom panel shown (the visit page). */
  startAtStreet?: boolean;
  /** A shorter map (the visit page). */
  compact?: boolean;
};

// Maps narrower than this put the zoom panel at the bottom and the style switcher top right.
const NARROW = 480;

/**
 * An empty Leaflet control for React to render into. Living in Leaflet's own corners keeps the
 * overlays above the map panes, stacked with the zoom buttons and attribution instead of on
 * top of them, and stops clicks and drags on them from moving the map.
 */
function overlayControl(className: string) {
  // One element for the control's whole life: setPosition() removes and re-adds the
  // control, and React's portals must keep pointing at the same node.
  const div = L.DomUtil.create("div", `map-overlay ${className}`);
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  const Overlay = L.Control.extend({
    onAdd() {
      return div;
    },
  });
  return new Overlay();
}

// Visits are drawn one dot per place: pins rounded to this many decimals (about 100 m) share a dot.
const PLACE_DECIMALS = 3;
// The most visits listed in a dot's popup; the rest are summed up as "and N more".
const POPUP_LIMIT = 10;

type Place = { key: string; lat: number; lon: number; pins: MapPin[] };

/** Groups pins by rounded coordinates, newest visit first in each place. */
export function groupPlaces(pins: MapPin[]): Place[] {
  const places = new Map<string, Place>();
  for (const pin of pins) {
    if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lon)) continue;
    const key = `${pin.lat.toFixed(PLACE_DECIMALS)},${pin.lon.toFixed(PLACE_DECIMALS)}`;
    const place = places.get(key);
    if (place) place.pins.push(pin);
    else places.set(key, { key, lat: pin.lat, lon: pin.lon, pins: [pin] });
  }
  const time = (pin: MapPin) => new Date(pin.visitedAt).getTime() || 0;
  for (const place of places.values()) place.pins.sort((a, b) => time(b) - time(a));
  return [...places.values()];
}

/** Popup for one place: its name, visit count, and up to POPUP_LIMIT visits, newest first. */
function placePopup(place: Place, select: (pin: MapPin) => ((pin: MapPin) => void) | undefined): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "visit-pop";
  const latest = place.pins[0];
  const title = document.createElement("strong");
  title.textContent = placeLabel(latest, CITY_ZOOM);
  const meta = document.createElement("p");
  meta.className = "visit-pop-meta";
  meta.textContent = `${place.pins.length} ${place.pins.length === 1 ? "visit" : "visits"}`;
  const list = document.createElement("ul");
  list.className = "visit-pop-list";
  for (const pin of place.pins.slice(0, POPUP_LIMIT)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "visit-pop-item";
    link.href = `/admin/visits/${pin.id}`;
    link.textContent = `${new Date(pin.visitedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${pin.path || "/"}`;
    link.addEventListener("click", (event) => {
      const onSelect = select(pin);
      if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      onSelect(pin);
    });
    item.append(link);
    list.append(item);
  }
  popup.append(title, meta, list);
  const more = place.pins.length - POPUP_LIMIT;
  if (more > 0) {
    const rest = document.createElement("p");
    rest.className = "visit-pop-meta";
    rest.textContent = `and ${more} more`;
    popup.append(rest);
  }
  return popup;
}

export default function VisitMap({ pins, onSelect, startAtStreet = false, compact = false }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  // The dot the zoom panel is for. Cleared when the user drags the map.
  const [focus, setFocus] = useState<Focus | null>(null);
  // The focused dot's marker. The cluster layer redraws markers after a zoom, which closes
  // an open popup, so the popup is opened again whenever a move ends while a dot is focused.
  const focusMarker = useRef<L.Marker | null>(null);
  const started = useRef(false);
  const [style, setStyle] = useState<MapStyle>(savedStyle);
  const [menuOpen, setMenuOpen] = useState(false);
  const styleRef = useRef(style);
  const tileRef = useRef<L.TileLayer | null>(null);
  // Where the overlays render: containers inside Leaflet's control corners.
  const [slots, setSlots] = useState<{ panel: HTMLElement; style: HTMLElement } | null>(null);

  useEffect(() => {
    const element = node.current;
    if (!element || mapRef.current) return;
    const map = L.map(element, {
      scrollWheelZoom: false,
      // Quarter-step zoom so the +/- buttons move in half steps.
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomAnimation: !reducedMotion(),
      markerZoomAnimation: !reducedMotion(),
      fadeAnimation: false,
    }).setView(HOME_CENTER, HOME_ZOOM);
    map.on("dragstart", () => {
      focusMarker.current = null;
      setFocus(null);
    });
    map.on("moveend", () => {
      const marker = focusMarker.current;
      if (marker) setTimeout(() => marker.openPopup(), 0);
    });
    map.on("click", () => setMenuOpen(false));
    tileRef.current = tileLayer(styleRef.current).addTo(map);
    // Each marker is already one place, so clusters never fan out into stacked dots
    // (spiderfy), stop clustering by street level, and count visits rather than places.
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      animate: false,
      animateAddingMarkers: false,
      spiderfyOnMaxZoom: false,
      disableClusteringAtZoom: 13,
      iconCreateFunction: (group) => {
        const visits = group
          .getAllChildMarkers()
          .reduce((sum, marker) => sum + ((marker.options as { visits?: number }).visits ?? 1), 0);
        const size = visits < 10 ? "small" : visits < 100 ? "medium" : "large";
        return L.divIcon({
          html: `<div><span>${visits}</span></div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(36, 36),
        });
      },
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    const panelControl = overlayControl("map-panel-slot").addTo(map);
    const styleControl = overlayControl("map-style-slot").addTo(map);
    const place = () => {
      const width = map.getSize().x;
      const narrow = width < NARROW;
      element.style.setProperty("--map-w", `${width}px`);
      const panelAt = narrow ? "bottomright" : "topright";
      const styleAt = narrow ? "topright" : "bottomleft";
      if (panelControl.getPosition() !== panelAt) panelControl.setPosition(panelAt);
      if (styleControl.getPosition() !== styleAt) styleControl.setPosition(styleAt);
    };
    place();
    map.on("resize", place);
    setSlots({ panel: panelControl.getContainer()!, style: styleControl.getContainer()! });
    return () => {
      setSlots(null);
      tileRef.current = null;
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const now = Date.now();
    for (const place of groupPlaces(pins)) {
      const latest = place.pins[0];
      const count = place.pins.length;
      const age = now - new Date(latest.visitedAt).getTime();
      const classes = ["visit-pin-dot"];
      if (age < 5 * 60 * 1000) classes.push("is-live");
      else if (age < 24 * 60 * 60 * 1000) classes.push("is-recent");
      if (count > 1) classes.push("has-count");
      const size = count > 1 ? 20 : 16;
      const options: L.MarkerOptions & { visits: number } = {
        visits: count,
        icon: L.divIcon({
          className: "visit-pin",
          html: `<span class="${classes.join(" ")}">${count > 1 ? `<span class="visit-pin-count">${count > 99 ? "99+" : count}</span>` : ""}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: `${placeLabel(latest, CITY_ZOOM)}: ${count} ${count === 1 ? "visit" : "visits"}`,
      };
      const marker = L.marker([place.lat, place.lon], options);
      marker.bindPopup(placePopup(place, () => selectRef.current), { autoPan: false, maxWidth: 280 });
      marker.on("click", () => {
        const map = mapRef.current;
        if (!map) return;
        focusMarker.current = marker;
        setFocus({ pin: latest, zoom: CLICK_ZOOM });
        moveTo(map, [place.lat, place.lon], CLICK_ZOOM);
      });
      cluster.addLayer(marker);
    }
    const first = pins.find((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lon));
    const map = mapRef.current;
    if (startAtStreet && first && map && !started.current) {
      started.current = true;
      map.setView([first.lat, first.lon], STREET_ZOOM, { animate: false });
      setFocus({ pin: first, zoom: STREET_ZOOM });
    }
  }, [pins, startAtStreet]);

  function chooseStyle(next: MapStyle) {
    setMenuOpen(false);
    if (next.id === styleRef.current.id) return;
    styleRef.current = next;
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next.id);
    } catch {
      // Not remembered when storage is blocked.
    }
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    tileRef.current = tileLayer(next).addTo(map);
  }

  function zoomTo(zoom: number) {
    const map = mapRef.current;
    if (!map || !focus) return;
    setFocus({ ...focus, zoom });
    moveTo(map, [focus.pin.lat, focus.pin.lon], zoom);
  }

  function zoomOut() {
    const map = mapRef.current;
    if (!map) return;
    map.closePopup();
    focusMarker.current = null;
    setFocus(null);
    moveTo(map, HOME_CENTER, HOME_ZOOM);
  }

  return (
    <div>
      <div className={style.invert ? "map-frame map-invert" : "map-frame"}>
        <div ref={node} className={compact ? "map-canvas is-compact" : "map-canvas"} role="application" aria-label="Visit map" />
        {slots &&
          createPortal(
            <div className="map-style">
              {menuOpen && (
                <ul className="map-style-menu" role="menu" aria-label="Map style">
                  {STYLES.map((item) => (
                    <li key={item.id} role="none">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={item.id === style.id}
                        className={`map-zoom-option${item.id === style.id ? " is-active" : ""}`}
                        onClick={() => chooseStyle(item)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="map-zoom-option map-style-toggle"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={(event) => event.key === "Escape" && setMenuOpen(false)}
              >
                Map: {style.label}
              </button>
            </div>,
            slots.style,
          )}
        {slots &&
          focus &&
          createPortal(
            <div className="map-zoom-panel" role="group" aria-label={`Zoom on ${placeLabel(focus.pin, CITY_ZOOM)}`}>
              <p className="map-zoom-place" aria-live="polite">
                {placeLabel(focus.pin, focus.zoom)}
              </p>
              <div className="map-zoom-levels">
                {LEVELS.map((level) => (
                  <button
                    key={level.label}
                    type="button"
                    className={`map-zoom-option${focus.zoom === level.zoom ? " is-active" : ""}`}
                    aria-pressed={focus.zoom === level.zoom}
                    onClick={() => zoomTo(level.zoom)}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
              <button type="button" className="map-zoom-option map-zoom-out" onClick={zoomOut}>
                Zoom out
              </button>
            </div>,
            slots.panel,
          )}
      </div>
      <ul className="map-legend">
        <li><span className="visit-pin-dot is-live" aria-hidden="true" /> Last 5 minutes</li>
        <li><span className="visit-pin-dot is-recent" aria-hidden="true" /> Last day</li>
        <li><span className="visit-pin-dot" aria-hidden="true" /> Older</li>
        <li>Numbers count visits at one place (about 100 m)</li>
      </ul>
    </div>
  );
}
