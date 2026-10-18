import { CFG } from "../config.js";
import { token } from "../core/auth.js";
import { state, RISK } from "../core/store.js";
import { esc } from "../ui/components.js";
import R, { cwsList } from "../data/registry.js";

let map, cwsLayer, farmLayer, selLayer, inited = false;
let basemaps = {};
const viewFarms = new Set();
let dateBounds = null;

const COLOURS_YEAR = ["#f6e8c3", "#dfc27d", "#bf812d", "#8c510a", "#543005"];
const DISTRICT_HUE = (s) => { let h = 0; for (const c of String(s || "x")) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 52%)`; };

export function initMap(containerId) {
  const el = document.getElementById(containerId);
  if (inited && map && map._container === el) { map.invalidateSize(); return map; }
  if (inited && map && map._container !== el) { try { map.remove(); } catch { /* ignore */ } inited = false; }
  map = L.map(el, { preferCanvas: true, zoomControl: true }).setView([-1.95, 29.9], 8);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Esri" });
  const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  const topo = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Esri" });
  sat.addTo(map);
  basemaps = { Satellite: sat, Streets: streets, Terrain: topo };
  L.control.layers(basemaps, null, { position: "topright" }).addTo(map);
  farmLayer = L.layerGroup().addTo(map);
  cwsLayer = L.layerGroup().addTo(map);
  selLayer = L.layerGroup().addTo(map);
  map.on("moveend", onMoveEnd);
  inited = true;
  return map;
}

export function setBasemap(name) { if (basemaps[name]) { Object.values(basemaps).forEach(b => map.removeLayer(b)); basemaps[name].addTo(map); } }

function colourFor(rec) {
  const attr = state.colourBy;
  if (attr === "eudr") return RISK[rec.risk] || RISK.none;
  if (attr === "area") { const a = rec.attrs.area_ha || 0; return a > 1 ? "#08519c" : a > 0.5 ? "#3182bd" : a > 0.2 ? "#6baed6" : "#bdd7e7"; }
  if (attr === "district") return DISTRICT_HUE(rec.attrs.district);
  const y = rec.attrs.first_planting_year || 0;
  const idx = y >= 2018 ? 4 : y >= 2010 ? 3 : y >= 2000 ? 2 : y >= 1980 ? 1 : 0;
  return COLOURS_YEAR[idx];
}

function inDate(rec) {
  const f = state.timeline;
  if (!f.from && !f.to) return true;
  const d = rec.attrs.mapped_date || (rec.attrs.first_planting_year ? String(rec.attrs.first_planting_year) + "-01-01" : null);
  if (!d) return true;
  const ds = String(d).slice(0, 10);
  if (f.from && ds < f.from) return false;
  if (f.to && ds > f.to) return false;
  return true;
}

export function renderFarms(selKeys, scopeFarmIds) {
  if (!inited) return;
  cwsLayer.clearLayers();
  const scopeStation = new Set();
  for (const e of (scopeFarmIds || [])) scopeStation.add(R.records.farm.find(f => f.id === e)?.attrs.station_inferred);
  for (const s of cwsList()) {
    const sel = selKeys?.has("cws:" + s.id);
    const dim = selKeys && !sel;
    L.circleMarker([s.lat, s.lng], {
      radius: sel ? 10 : 6, fillColor: "#3b6ea5", color: "#fff", weight: sel ? 3 : 1.5,
      fillOpacity: dim ? 0.25 : 0.95, opacity: dim ? 0.35 : 1
    }).on("click", () => window.__naeb_select && window.__naeb_select("cws", s.id))
      .bindTooltip(`${esc(s.attrs.name)} · ${esc(s.attrs.district || "")}`).addTo(cwsLayer);
  }
  drawFarmsInView(selKeys);
}

function drawFarmsInView(selKeys) {
  if (!inited) return;
  farmLayer.clearLayers();
  const b = map.getBounds().pad(0.1);
  const zoom = map.getZoom();
  let shown = 0;
  const all = R.records.farm || [];
  for (const f of all) {
    if (!inDate(f)) continue;
    const pt = f.c ? L.latLng(f.c[0], f.c[1]) : (f.ring ? L.latLng(f.ring[0][0], f.ring[0][1]) : null);
    if (!pt || !b.contains(pt)) continue;
    const sel = selKeys?.has("farm:" + f.id);
    const dim = selKeys && !sel;
    if (zoom < CFG.POLY_MIN_ZOOM && !sel) {
      L.circleMarker(pt, { radius: 2.5, stroke: false, fillColor: colourFor(f), fillOpacity: dim ? 0.25 : 0.8 }).addTo(farmLayer);
      shown++;
    } else if (f.ring) {
      L.polygon(f.ring, {
        color: sel ? "#111" : "#F7CF3B", weight: sel ? 3 : 1,
        fillColor: colourFor(f), fillOpacity: dim ? 0.15 : (sel ? 0.75 : 0.55)
      }).on("click", () => window.__naeb_select && window.__naeb_select("farm", f.id))
        .bindTooltip(`${esc(f.id)} · ${f.attrs.area_ha ?? "?"} ha · ${esc(f.why || "")}`).addTo(farmLayer);
      shown++;
    }
    if (shown > 8000) break;
  }
}

function onMoveEnd() { drawFarmsInView(currentSelKeys); }
let currentSelKeys = null;
export function setSelection(selKeys) { currentSelKeys = selKeys; }

export function highlightSelection(selKeys) {
  setSelection(selKeys);
  selLayer.clearLayers();
  if (selKeys) {
    for (const k of selKeys) {
      const [m, id] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
      if (m === "farm") {
        const f = R.records.farm.find(x => x.id === id);
        if (f?.ring) L.polygon(f.ring, { color: "#111", weight: 3, fillColor: "#ffd54a", fillOpacity: 0.5 }).addTo(selLayer);
      }
    }
  }
  drawFarmsInView(selKeys);
}

export function fitToFarms(ids) {
  if (!inited) return;
  const pts = [];
  for (const id of (ids || [])) { const f = R.records.farm.find(x => x.id === id); if (f?.c) pts.push(f.c); }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 });
}

export function fitToStations() {
  if (!inited) return;
  const pts = cwsList().filter(s => s.lat).map(s => [s.lat, s.lng]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35));
}

export function mapInstance() { return map; }
export function invalidate() { if (map) map.invalidateSize(); }
