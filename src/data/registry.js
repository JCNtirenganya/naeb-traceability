import { CFG } from "../config.js";
import { token, user } from "../core/auth.js";
import { cloneSeed, SYSTEM_MODELS } from "./models.js";
import * as arc from "./arcgis.js";
import { generateDemoSuite, demoSessionStore, hashStr } from "./demo.js";

const listeners = [];
export function onRegistry(fn) { listeners.push(fn); }
function notify(ev) { listeners.forEach(fn => fn(ev)); }

const R = {
  models: [],
  byId: {},
  records: {},        // modelId -> array of normalized records
  index: {},          // modelId -> search entries
  session: demoSessionStore(),
  farmsUrl: null,
  cwsUrl: CFG.CWS_URL,
  registryItemId: null,
  ready: false,
  farmScreen: {},     // plot_id -> {risk, why}
  farmers: [],        // derived
  demoSuites: {}      // modelId -> demo rows
};
export default R;

export const models = () => R.models.filter(m => !m.hidden);
export const getModel = (id) => R.byId[id];
export const list = (modelId) => R.records[modelId] || [];
export const get = (modelId, id) => list(modelId).find(r => r.id === id);
export const isDemoModel = (m) => m.kind === "recordable" && !m.url;
export const recordsOf = (modelId) => {
  const m = R.byId[modelId];
  if (!m) return [];
  if (m.kind === "recordable" && !m.url) {
    const demo = R.demoSuites[modelId] || [];
    const sess = R.session.get(modelId);
    return [...demo, ...sess];
  }
  return R.records[modelId] || [];
};

export async function init() {
  R.models = cloneSeed();
  R.byId = Object.fromEntries(R.models.map(m => [m.id, m]));
  await loadRegistryItem();
  await loadData();
  R.ready = true;
  notify("ready");
}

async function loadRegistryItem() {
  const tk = token();
  if (!tk) return;
  try {
    let itemId = CFG.MODEL_REGISTRY_ITEM_ID;
    if (!itemId) {
      const found = await arc.findItemsByTitle(CFG.PORTAL, CFG.MODEL_REGISTRY_TITLE, tk);
      const mine = found.find(i => i.type === "JSON");
      if (mine) itemId = mine.id;
    }
    if (!itemId) return;
    const data = await arc.fetchItemData(CFG.PORTAL, itemId, tk);
    R.registryItemId = itemId;
    if (data && Array.isArray(data.models)) {
      for (const md of data.models) {
        if (md.kind === "system-live") {
          const sys = R.byId[md.id];
          if (sys) Object.assign(sys, md, { url: sys.url });
        } else {
          R.byId[md.id] = { ...(R.byId[md.id] || {}), ...md };
        }
      }
      R.models = Object.values(R.byId);
    }
  } catch (e) { console.warn("Model registry load:", e.message); }
}

export async function saveRegistry() {
  const tk = token();
  if (!tk) throw new Error("Sign in to save the model registry.");
  const payload = JSON.stringify({
    version: 1, updated: new Date().toISOString(),
    models: R.models.filter(m => m.kind !== "system-live")
  });
  R.registryItemId = await arc.saveItem(CFG.PORTAL, {
    id: R.registryItemId, title: CFG.MODEL_REGISTRY_TITLE, type: "JSON", text: payload, folder: CFG.TRACE_FOLDER
  }, tk);
  notify("registry");
  return R.registryItemId;
}

export function upsertModel(def) {
  R.byId[def.id] = { ...(R.byId[def.id] || {}), ...def };
  R.models = Object.values(R.byId);
  notify("models");
}

export async function loadData() {
  const tk = token();
  R.cwsUrl = CFG.CWS_URL;
  R.farmsUrl = CFG.FARMS_URL || null;

  const cwsFeats = await arc.queryLayer(R.cwsUrl, { outFields: "*", returnGeometry: true, token: null });
  R.records.cws = cwsFeats.map(f => {
    const a = f.attributes, m = R.byId.cws;
    const attrs = {};
    for (const [k, fn] of Object.entries(m.fieldMap)) attrs[k] = fn(a);
    return {
      id: attrs.id, modelId: "cws", attrs, dataSource: "live",
      lng: attrs.x ?? f.geometry?.x, lat: attrs.y ?? f.geometry?.y
    };
  }).filter(r => r.lat != null && r.lng != null && r.id);

  if (!tk) { R.records.farm = []; R.farmers = []; R.farmScreen = {}; rebuildIndex(); notify("data"); return; }

  if (!R.farmsUrl) {
    const it = await arc.fetchItem(CFG.PORTAL, CFG.FARMS_ITEM_ID, tk);
    if (it.error) throw new Error("Cannot open the farms item — sign in again or check permissions.");
    R.farmsUrl = /\/\d+$/.test(it.url || "") ? it.url : `${it.url}/${CFG.FARMS_LAYER}`;
  }
  const farmFeats = await arc.queryLayer(R.farmsUrl, {
    outFields: "*", returnGeometry: true, token: tk,
    maxAllowableOffset: 0.00002, resultRecordCount: 1000
  });
  const m = R.byId.farm;
  const seen = new Map();
  for (const f of farmFeats) {
    const a = f.attributes;
    if (/\btest\b/i.test(String(a.farmer_name || ""))) continue;
    if (a.plot_id == null) continue;
    const attrs = {};
    for (const [k, fn] of Object.entries(m.fieldMap)) attrs[k] = fn(a);
    attrs.CreationDate = a.CreationDate ?? a.created_date ?? null;
    const ring = f.geometry?.rings?.[0]?.map(p => [p[1], p[0]]);
    const { risk, why } = screenEudr(attrs);
    const id = String(attrs.plot_id);
    const rec = {
      id, modelId: "farm", attrs, dataSource: "live", risk, why, ring,
      oid: a.objectid,
      c: ring ? centroid(ring) : null
    };
    seen.set(id, rec);
    R.farmScreen[id] = { risk, why };
  }
  R.records.farm = [...seen.values()];
  deriveFarmers();
  rebuildIndex();
  notify("data");
}

export function screenEudr(a) {
  const first = a.first_planting_year >= 1900 && a.first_planting_year <= 2026 ? a.first_planting_year : null;
  const forest = String(a.prior_land_use || "").startsWith("Forest");
  if (a.overlaps_other_plot) return { risk: "blocked", why: "Plot geometry: " + String(a.overlaps_other_plot).replace(/_/g, " ") };
  if (first == null) return { risk: "review", why: "Planting year missing/invalid" };
  if (forest) return { risk: "review", why: first > 2020 ? "Forest/wooded land converted after 31 Dec 2020" : "Prior land use was forest — verify date" };
  return { risk: "low", why: "No flags — satellite check pending" };
}

function centroid(ring) {
  const n = ring.length || 1;
  return [ring.reduce((t, p) => t + p[0], 0) / n, ring.reduce((t, p) => t + p[1], 0) / n];
}

function deriveFarmers() {
  const by = {};
  for (const f of R.records.farm) {
    const fid = f.attrs.farmer_id;
    if (!fid) continue;
    (by[fid] = by[fid] || []).push(f);
  }
  R.farmers = Object.entries(by).map(([fid, plots]) => ({
    id: fid, modelId: "farmer", dataSource: "live",
    attrs: {
      farmer_id: fid, farmer_name: plots[0].attrs.farmer_name || "",
      district: plots[0].attrs.district, sector: plots[0].attrs.sector, cell: plots[0].attrs.cell,
      plot_count: plots.length,
      area_ha: Math.round(plots.reduce((t, p) => t + (p.attrs.area_ha || 0), 0) * 100) / 100,
      prod_kg: plots.reduce((t, p) => t + (p.attrs.prod_kg_2025 || 0), 0) || null
    },
    plots
  }));
  R.records.farmer = R.farmers;
}

export const plotsOfFarmer = (fid) => R.records.farm.filter(f => f.attrs.farmer_id === fid);

export function rebuildIndex() {
  R.index = {};
  for (const m of R.models) {
    if (!m.searchable || m.hidden) continue;
    R.index[m.id] = recordsOf(m.id)
      .filter(r => !(R.byId[r.modelId]?.softDelete && r.attrs[R.byId[r.modelId].softDelete] === 0))
      .map(r => ({
        modelId: m.id, id: r.id,
        title: titleOf(m, r),
        sub: subtitleOf(m, r),
        hay: (titleOf(m, r) + " " + r.id + " " + subtitleOf(m, r)).toLowerCase()
      }));
  }
}

export function titleOf(m, r) {
  if (!r) return "";
  const tf = m.titleField;
  const v = r.attrs?.[tf];
  return v != null && v !== "" ? String(v) : (r.id || "—");
}

export function subtitleOf(m, r) {
  if (r.modelId === "cws") return `${r.attrs.sector || ""}, ${r.attrs.district || ""}`.replace(/^, /, "");
  if (r.modelId === "farm") return `${r.attrs.sector || ""} · ${r.attrs.area_ha ?? "?"} ha · ${r.risk || ""}`;
  if (r.modelId === "farmer") return `${r.attrs.sector || ""} · ${r.attrs.plot_count || 0} plot(s)`;
  if (m.storage === "table") {
    const bits = m.listColumns?.filter(c => c !== m.titleField).slice(0, 3).map(c => r.attrs[c]).filter(x => x != null && x !== "");
    return bits.join(" · ");
  }
  return m.plural;
}

export function searchAll(q, limit = 40) {
  const needle = q.toLowerCase().trim();
  if (!needle) return [];
  const out = [];
  for (const [mid, entries] of Object.entries(R.index)) {
    for (const e of entries) {
      if (e.hay.includes(needle)) out.push(e);
      if (out.length > limit * 3) break;
    }
  }
  out.sort((a, b) => {
    const ap = a.hay.startsWith(needle) ? 0 : a.title.toLowerCase().startsWith(needle) ? 1 : 2;
    const bp = b.hay.startsWith(needle) ? 0 : b.title.toLowerCase().startsWith(needle) ? 1 : 2;
    return ap - bp || a.title.localeCompare(b.title);
  });
  return out.slice(0, limit);
}

export function dataStatus() {
  return R.models.filter(m => m.kind !== "system-derived" || m.id === "farmer").map(m => {
    if (m.kind === "system-live") return { model: m, source: "live", count: list(m.id).length, note: "Existing NAEB GIS layer (read-only)" };
    if (m.kind === "system-derived") return { model: m, source: "live", count: R.farmers.length, note: "Derived from farm polygons" };
    if (m.url) return { model: m, source: "recorded", count: recordsOf(m.id).length, note: "Hosted table in portal — " + m.url };
    return { model: m, source: "indicative", count: recordsOf(m.id).length, note: "Demo data — publish to the portal to record real rows" };
  });
}

/* ---------- writes ---------- */

function attrsToEsri(m, attrs, existingNames) {
  const out = {};
  for (const f of m.fields) {
    let v = attrs[f.name];
    if (v === undefined) continue;
    if (f.type === "boolean") v = v === true || v === 1 || v === "1" ? 1 : 0;
    if ((f.type === "date" || f.type === "datetime") && typeof v === "string" && v.length === 10) v = new Date(v + "T00:00:00Z").getTime();
    if (v === "") v = null;
    out[f.name.toLowerCase()] = v;
  }
  return out;
}

export async function create(modelId, attrs, geometry = null) {
  const m = R.byId[modelId];
  if (!m) throw new Error("Unknown model " + modelId);
  attrs = { ...attrs };
  const tk = token();
  if (!tk) throw new Error("Sign in to record data.");
  if (!m.url) {
    const n = R.session.get(modelId).length + 1;
    const key = m.titleField;
    if (!attrs[key]) attrs[key] = `NEW-${modelId.toUpperCase()}-${String(n).padStart(4, "0")}`;
    attrs.data_source = "recorded"; attrs.is_active = 1;
    const row = { id: "SES:" + modelId + ":" + attrs[key], modelId, attrs, dataSource: "recorded", session: true, geometry };
    R.session.add(modelId, row);
    rebuildIndex(); notify("data");
    return row;
  }
  attrs.data_source = "recorded";
  const esriAttrs = attrsToEsri(m, attrs);
  esriAttrs.globalid = "{" + crypto.randomUUID().toUpperCase() + "}";
  const feat = { attributes: esriAttrs };
  if (geometry) feat.geometry = geometry;
  const d = await arc.applyEdits(m.url, { adds: [feat] }, tk);
  const added = (d.addResults || [])[0];
  if (!added || added.error) throw new Error(added?.error?.message || "Write failed");
  await refreshModel(modelId);
  return get(modelId, added.globalId || added.objectId);
}

export async function update(modelId, id, attrs, geometry = null) {
  const m = R.byId[modelId];
  const tk = token();
  const rec = get(modelId, id);
  if (!rec) throw new Error("Record not found");
  attrs = { ...attrs };
  if (!m.url) {
    if (rec.session) {
      R.session.update(modelId, id, attrs);
    } else {
      const key = m.titleField;
      const clone = { id: "SES:" + modelId + ":" + (attrs[key] || id) + ":edit", modelId, attrs: { ...rec.attrs, ...attrs, data_source: rec.dataSource }, dataSource: rec.dataSource, session: true, supersedes: id };
      R.session.add(modelId, clone);
    }
    rebuildIndex(); notify("data");
    return get(modelId, id);
  }
  const esriAttrs = attrsToEsri(m, attrs);
  if (rec.oid == null) throw new Error("Record has no object id");
  esriAttrs.objectid = rec.oid;
  const feat = { attributes: esriAttrs };
  if (geometry) feat.geometry = geometry;
  await arc.applyEdits(m.url, { updates: [feat] }, tk);
  await refreshModel(modelId);
  return get(modelId, id);
}

export async function softDelete(modelId, id) {
  const m = R.byId[modelId];
  const rec = get(modelId, id);
  if (!rec) return;
  if (!m.softDelete) throw new Error("This model does not support soft delete");
  if (!m.url) {
    if (rec.session) R.session.update(modelId, id, { is_active: 0 });
    else {
      const clone = { ...rec, id: "SES:" + modelId + ":" + id + ":del", attrs: { ...rec.attrs, is_active: 0 }, session: true };
      R.session.add(modelId, clone);
    }
    rebuildIndex(); notify("data");
    return;
  }
  await update(modelId, id, { [m.softDelete]: 0 });
}

export async function refreshModel(modelId) {
  const m = R.byId[modelId];
  if (!m || !m.url) return;
  const tk = token();
  const feats = await arc.queryLayer(m.url, { outFields: "*", returnGeometry: m.storage !== "table", token: tk });
  R.records[modelId] = feats.map(f => normalizeArcgis(m, f)).filter(Boolean);
  rebuildIndex(); notify("data");
}

function normalizeArcgis(m, f) {
  const a = f.attributes;
  if (m.softDelete && a[m.softDelete] === 0) return null;
  const attrs = {};
  for (const fld of m.fields) attrs[fld.name] = a[fld.name.toLowerCase()] ?? a[fld.name] ?? null;
  attrs.data_source = attrs.data_source || "recorded";
  const id = a.globalid || String(a.objectid);
  return {
    id, modelId: m.id, attrs, dataSource: attrs.data_source === "indicative" ? "indicative" : "recorded",
    oid: a.objectid, globalid: a.globalid,
    lng: m.latField ? attrs[m.lngField] : f.geometry?.x,
    lat: m.latField ? attrs[m.latField] : f.geometry?.y,
    geometry: f.geometry || null,
    createdBy: a.created_user, createdDate: a.created_date, editedBy: a.edited_user, editedDate: a.edited_date
  };
}

export async function publishModel(modelId) {
  const m = R.byId[modelId];
  const tk = token();
  if (!tk) throw new Error("Sign in to publish.");
  if (!user() || user().role === "user") {
    // still attempt; portal will reject if insufficient rights
  }
  let folderId = null;
  try { folderId = await arc.ensureFolder(CFG.PORTAL, CFG.TRACE_FOLDER, tk); }
  catch (e) { throw new Error("Cannot create the '" + CFG.TRACE_FOLDER + "' folder in your content: " + e.message); }
  let url = m.url;
  if (!url) {
    const existing = await arc.findItemsByTitle(CFG.PORTAL, "NAEB_Trace_" + modelId, tk);
    const svc = existing.find(i => i.type === "Feature Service" || i.type === "Map Service");
    if (svc && svc.url) {
      url = svc.url + "/0";
    } else {
      const pub = await arc.publishModelLayer(CFG.PORTAL, m, folderId, tk);
      url = pub.url;
    }
  } else {
    await arc.addMissingFields(url, m, tk);
  }
  m.url = url;
  upsertModel(m);
  await saveRegistry();
  await refreshModel(modelId);
  return url;
}

export function setDemoData(suite) { R.demoSuites = suite; }

export function activeFilterValue(modelId, field, record) {
  return record.attrs?.[field];
}

export function related(modelId, field, value) {
  const m = R.byId[modelId];
  if (!m) return [];
  if (modelId === "farmer") return [];
  return recordsOf(modelId).filter(r => r.attrs?.[field] === value);
}

export function farmCount() { return R.records.farm.length; }
export function farmerCount() { return R.farmers.length; }
export function cwsList() { return R.records.cws; }

export function ensureDemoSuite() {
  if (!R.demoSuites.delivery) {
    R.demoSuites = generateDemoSuite(R.models, { cws: R.records.cws, farms: R.records.farm });
  }
  return R.demoSuites;
}

export async function loadAfterSignIn() {
  ensureDemoSuite();
  await loadData();
}
