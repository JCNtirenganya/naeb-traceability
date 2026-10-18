import { recordsOf, get, getModel, titleOf, cwsList } from "./registry.js";
import { hashStr } from "./demo.js";

let GRAPH = null;

export function key(model, id) { return model + ":" + id; }
export function unkey(k) { const i = k.indexOf(":"); return { model: k.slice(0, i), id: k.slice(i + 1) }; }

export function buildGraph() {
  const g = { nodes: new Map(), edges: [], adj: new Map() };
  const addNode = (model, id, extra = {}) => {
    const k = key(model, id);
    if (!g.nodes.has(k)) g.nodes.set(k, { model, id, ...extra });
    return k;
  };
  const addEdge = (fromModel, fromId, toModel, toId, status, dataSource, label = "") => {
    const a = addNode(fromModel, fromId), b = addNode(toModel, toId);
    const e = { from: a, to: b, status, dataSource, label };
    g.edges.push(e);
    (g.adj.get(a) || g.adj.set(a, []).get(a)).push(b);
    (g.adj.get(b) || g.adj.set(b, []).get(b)).push(a);
  };

  const cwsIds = new Set(cwsList().map(s => s.id));
  const stationBySector = {};
  for (const s of cwsList()) {
    (stationBySector[s.district + "|" + s.sector] = stationBySector[s.district + "|" + s.sector] || []).push(s.id);
    (stationBySector[s.district] = stationBySector[s.district] || []).push(s.id);
  }

  const farms = recordsOf("farm");
  for (const f of farms) {
    addNode("farm", f.id, { dataSource: "live", risk: f.risk });
    if (f.attrs.farmer_id) {
      addNode("farmer", f.attrs.farmer_id, { dataSource: "live" });
      addEdge("farmer", f.attrs.farmer_id, "farm", f.id, "confirmed", "live", "owns plot");
    }
  }

  const farmersWithDelivery = new Set();
  for (const d of recordsOf("delivery")) {
    if (d.attrs.is_active === 0) continue;
    const ds = d.dataSource;
    addNode("delivery", d.id, { dataSource: ds });
    if (d.attrs.farmer_id) {
      farmersWithDelivery.add(String(d.attrs.farmer_id));
      addEdge("farmer", d.attrs.farmer_id, "delivery", d.id, "confirmed", ds, "delivered cherries");
      if (d.attrs.plot_id) addEdge("farm", String(d.attrs.plot_id), "delivery", d.id, "confirmed", ds, "plot on delivery");
    }
    if (d.attrs.cws_id && cwsIds.has(d.attrs.cws_id))
      addEdge("cws", d.attrs.cws_id, "delivery", d.id, "confirmed", ds, "received");
  }

  for (const f of farms) {
    const fid = String(f.attrs.farmer_id || "");
    if (!fid) continue;
    let st = null;
    if (farmersWithDelivery.has(fid)) continue;
    const pool = stationBySector[f.attrs.district + "|" + f.attrs.sector] || stationBySector[f.attrs.district] || cwsList().map(s => s.id);
    st = pool[hashStr(fid) % pool.length];
    if (st && cwsIds.has(st)) addEdge("cws", st, "farmer", fid, "inferred", "indicative", "roster (sector)");
  }

  for (const ll of recordsOf("lot_delivery")) {
    if (ll.attrs.is_active === 0) continue;
    addNode("lot_delivery", ll.id, { dataSource: ll.dataSource });
    const lot = get("lot", ll.attrs.lot_id);
    const dlv = get("delivery", ll.attrs.delivery_id);
    if (lot && dlv) {
      addEdge("delivery", dlv.id, "lot_delivery", ll.id, "confirmed", ll.dataSource, "pooled");
      addEdge("lot_delivery", ll.id, "lot", lot.id, "confirmed", ll.dataSource, "into lot");
    }
  }
  for (const l of recordsOf("lot")) {
    if (l.attrs.is_active === 0) continue;
    addNode("lot", l.id, { dataSource: l.dataSource });
    if (l.attrs.cws_id && cwsIds.has(l.attrs.cws_id)) addEdge("cws", l.attrs.cws_id, "lot", l.id, "confirmed", l.dataSource, "processed");
  }
  for (const bl of recordsOf("batch_lot")) {
    if (bl.attrs.is_active === 0) continue;
    addNode("batch_lot", bl.id, { dataSource: bl.dataSource });
    const lot = get("lot", bl.attrs.lot_id);
    const bat = get("batch", bl.attrs.batch_id);
    if (lot && bat) {
      addEdge("lot", lot.id, "batch_lot", bl.id, "confirmed", bl.dataSource, "allocated");
      addEdge("batch_lot", bl.id, "batch", bat.id, "confirmed", bl.dataSource, "in batch");
    }
  }
  for (const b of recordsOf("batch")) {
    if (b.attrs.is_active === 0) continue;
    addNode("batch", b.id, { dataSource: b.dataSource });
    if (b.attrs.exporter_id) { addNode("exporter", b.attrs.exporter_id, { dataSource: b.dataSource }); addEdge("batch", b.id, "exporter", b.attrs.exporter_id, "confirmed", b.dataSource, "exported by"); }
    if (b.attrs.importer_id) { addNode("importer", b.attrs.importer_id, { dataSource: b.dataSource }); addEdge("batch", b.id, "importer", b.attrs.importer_id, "confirmed", b.dataSource, "shipped to"); }
  }
  for (const e of recordsOf("exporter")) if (e.attrs.is_active !== 0) addNode("exporter", e.id, { dataSource: e.dataSource });
  for (const i of recordsOf("importer")) if (i.attrs.is_active !== 0) addNode("importer", i.id, { dataSource: i.dataSource });

  g.nodeOf = (model, id) => g.nodes.get(key(model, id));
  GRAPH = g;
  return g;
}

export function graph() { return GRAPH || buildGraph(); }

export function chainSourceOf(edgeList) {
  if (edgeList.some(e => e.dataSource === "indicative")) return "indicative";
  if (edgeList.some(e => e.dataSource === "recorded")) return "recorded";
  return "live";
}

export function traceFrom(model, id, maxDepth = 12) {
  const g = graph();
  const start = key(model, id);
  if (!g.nodes.has(start)) return { nodes: new Set(), edges: [], chainSource: "live" };
  const seenNodes = new Set([start]);
  const seenEdges = new Set();
  const edges = [];
  let frontier = [start];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const k of frontier) {
      for (const nk of g.adj.get(k) || []) {
        const ek = [k, nk].sort().join("|");
        if (seenEdges.has(ek)) continue;
        seenEdges.add(ek);
        const e = g.edges.find(e => ([e.from, e.to].sort().join("|")) === ek);
        if (!e) continue;
        edges.push(e);
        if (!seenNodes.has(nk)) { seenNodes.add(nk); next.push(nk); }
      }
    }
    frontier = next;
  }
  return { nodes: seenNodes, edges, chainSource: chainSourceOf(edges) };
}

function passFilters(rec, f) {
  const a = rec.attrs || {};
  if (f.source && rec.dataSource !== f.source) return false;
  if (rec.modelId === "farm" || rec.modelId === "farmer" || rec.modelId === "cws") {
    if (f.district && a.district !== f.district) return false;
    if (f.sector && a.sector !== f.sector) return false;
  }
  if (rec.modelId === "farm" && f.risk && rec.risk !== f.risk) return false;
  const dt = a.delivery_date || a.ship_date || a.created_date;
  if (f.from && dt && dt < f.from) return false;
  if (f.to && dt && dt > f.to) return false;
  if (f.cws) {
    const cwsFields = ["cws_id"];
    if (!cwsFields.some(k => a[k] === f.cws) && rec.modelId !== "cws" && rec.modelId !== "farm" && rec.modelId !== "farmer") return false;
    if (rec.modelId === "cws" && rec.id !== f.cws) return false;
  }
  if (f.exporter && a.exporter_id !== f.exporter && rec.modelId !== "exporter") return false;
  if (f.importer && a.importer_id !== f.importer && rec.modelId !== "importer") return false;
  return true;
}

export function computeScope(sel, filters = {}, opts = {}) {
  const g = graph();
  const showInd = opts.showIndicative !== false;
  let nodeSet, edges;
  if (!sel) {
    nodeSet = new Set(g.nodes.keys());
    edges = [...g.edges];
  } else {
    const t = traceFrom(sel.model, sel.id);
    nodeSet = t.nodes; edges = t.edges;
  }
  const byModel = {};
  const entities = [];
  for (const k of nodeSet) {
    const { model, id } = unkey(k);
    const rec = model === "farmer" ? (get("farmer", id) || { id, modelId: "farmer", attrs: { farmer_id: id }, dataSource: "live" }) : get(model, id);
    if (!rec) continue;
    if (model === "lot_delivery" || model === "batch_lot") continue;
    if (rec.attrs && rec.attrs.is_active === 0) continue;
    if (!showInd && rec.dataSource === "indicative" && !(model === "farm" || model === "cws" || model === "farmer")) continue;
    const m = getModel(model);
    if (!m) continue;
    if (!passFilters({ ...rec, modelId: model }, filters)) {
      if (sel && (sel.model === model && sel.id === id)) { /* keep the selected entity always */ }
      else if (sel && isChainCritical(model)) { /* keep chain integrity but mark filtered */ }
      else continue;
    }
    const linkStatus = edgeStatusFor(model, id, edges, sel);
    (byModel[model] = byModel[model] || []).push({ rec, linkStatus });
    entities.push({ model, id, rec, linkStatus });
  }
  for (const arr of Object.values(byModel)) arr.sort((a, b) => titleOf(getModel(a.rec.modelId), a.rec).localeCompare(titleOf(getModel(b.rec.modelId), b.rec)));
  const provenance = {};
  for (const e of entities) provenance[e.rec.dataSource] = (provenance[e.rec.dataSource] || 0) + 1;
  return { byModel, entities, edges, provenance, chainSource: chainSourceOf(edges), nodeSet };
}

function isChainCritical(model) {
  return ["delivery", "lot", "batch", "lot_delivery", "batch_lot"].includes(model);
}

function edgeStatusFor(model, id, edges, sel) {
  const k = key(model, id);
  const touching = edges.filter(e => e.from === k || e.to === k);
  if (!touching.length) return "confirmed";
  if (model === "farm" || model === "farmer") {
    if (touching.some(e => e.status === "inferred" && e.label.includes("roster"))) return "inferred";
  }
  return touching.every(e => e.status === "confirmed") ? "confirmed" : "inferred";
}

export function batchRisk(batchRec, scopeEntities) {
  const farms = (scopeEntities || []).filter(e => e.model === "farm").map(e => e.rec);
  if (!farms.length) return "none";
  if (farms.some(f => f.risk === "blocked")) return "blocked";
  if (farms.some(f => f.risk === "review")) return "review";
  return "low";
}

export function farmsOfBatch(batchId) {
  const t = traceFrom("batch", batchId, 8);
  const out = [];
  for (const k of t.nodes) {
    const { model, id } = unkey(k);
    if (model === "farm") { const f = get("farm", id); if (f) out.push(f); }
    if (model === "farmer") for (const p of (get("farmer", id)?.plots || [])) out.push(p);
  }
  return out;
}

export function scopeDescription(sel, filters) {
  const parts = [];
  if (sel) {
    const m = getModel(sel.model);
    const rec = get(sel.model, sel.id);
    parts.push(`${m ? m.name : sel.model}: ${rec ? titleOf(m, rec) : sel.id} (${sel.id})`);
  } else parts.push("Full network");
  for (const [k, v] of Object.entries(filters || {})) {
    if (v) parts.push(`${k}: ${v}`);
  }
  return parts.join(" · ");
}
