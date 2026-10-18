import { state, RISK } from "../core/store.js";
import { esc } from "../ui/components.js";
import R, { recordsOf } from "../data/registry.js";
import { graph as buildGraph, key } from "../data/chain.js";

const TYPE_COLOR = { farmer: "#7a5c3e", cws: "#3b6ea5", lot: "#c99a3a", batch: "#2b4c6f", exporter: "#6b5b95", importer: "#4b5a50" };
const TYPE_LABEL = { farmer: "Farmer", cws: "CWS", lot: "Lot", batch: "Batch", exporter: "Exporter", importer: "Importer" };
const COLORDER = { farmer: 0, cws: 1, lot: 2, batch: 3, exporter: 4, importer: 5 };

let expanded = new Set();
let tx = 20, ty = 20, k = 1;
let lastPayload = null;

export function setGraphExpanded(set) { expanded = set; if (lastPayload) render(lastPayload.container, lastPayload.opts); }

export function render(container, opts = {}) {
  lastPayload = { container, opts };
  const g = buildGraph();
  const scopeNodes = opts.nodeSet || null;
  const inScope = (model, id) => !scopeNodes || scopeNodes.has(key(model, id));

  const groups = {};        // cws -> farmer ids
  const farmerStation = {};
  for (const d of recordsOf("delivery")) {
    if (d.attrs.is_active === 0 || !d.attrs.farmer_id) continue;
    const fid = String(d.attrs.farmer_id);
    const st = d.attrs.cws_id;
    if (st && !farmerStation[fid]) farmerStation[fid] = st;
  }
  for (const f of (R.records.farmer || [])) {
    const st = farmerStation[f.id];
    if (!st) continue;
    (groups[st] = groups[st] || []).push(f.id);
  }
  const cwsNodes = (R.records.cws || []).filter(s => inScope("cws", s.id));
  const lots = recordsOf("lot").filter(l => l.attrs.is_active !== 0 && inScope("lot", l.id) && l.attrs.cws_id);
  const batches = recordsOf("batch").filter(b => b.attrs.is_active !== 0 && inScope("batch", b.id));
  const exporters = recordsOf("exporter").filter(e => e.attrs.is_active !== 0);
  const importers = recordsOf("importer").filter(i => i.attrs.is_active !== 0);

  const lotBatch = {};
  for (const bl of recordsOf("batch_lot")) if (bl.attrs.is_active !== 0) (lotBatch[bl.attrs.lot_id] = lotBatch[bl.attrs.lot_id] || []).push(bl.attrs.batch_id);

  const columns = [[], [], [], [], [], []];
  for (const s of cwsNodes) {
    const fids = groups[s.id] || [];
    if (fids.length) {
      columns[0].push({ model: "farmer", id: "grp:" + s.id, label: `${fids.length} farmer${fids.length > 1 ? "s" : ""}`, sub: s.attrs.name, color: TYPE_COLOR.farmer, group: true, cwsId: s.id, dataSource: "live" });
      if (expanded.has(s.id)) for (const fid of fids.slice(0, 60)) columns[0].push({ model: "farmer", id: fid, label: fid, color: TYPE_COLOR.farmer, dataSource: "live", parent: "grp:" + s.id });
    }
    columns[1].push({ model: "cws", id: s.id, label: s.attrs.name, color: TYPE_COLOR.cws, dataSource: "live" });
  }
  for (const l of lots.slice(0, 120)) columns[2].push({ model: "lot", id: l.id, label: l.attrs.lot_id, color: TYPE_COLOR.lot, dataSource: l.dataSource });
  for (const b of batches.slice(0, 120)) columns[3].push({ model: "batch", id: b.id, label: b.attrs.batch_id, color: TYPE_COLOR.batch, dataSource: b.dataSource });
  for (const e of exporters) columns[4].push({ model: "exporter", id: e.id, label: e.attrs.name, color: TYPE_COLOR.exporter, dataSource: e.dataSource });
  for (const i of importers) columns[5].push({ model: "importer", id: i.id, label: i.attrs.name, color: TYPE_COLOR.importer, dataSource: i.dataSource });

  const W = 1100, H = Math.max(460, ...columns.map(c => c.length * 30 + 40));
  const P = {};
  const colX = [90, 300, 520, 730, 900, 1050];
  columns.forEach((col, ci) => col.forEach((n, i) => {
    P[n.model + ":" + n.id] = { ...n, x: colX[ci], y: 30 + (i + 0.5) * ((H - 40) / Math.max(1, col.length)) };
  }));

  const edges = [];
  const E = (a, b, status, ds) => { const pa = P[a], pb = P[b]; if (pa && pb) edges.push({ a: pa, b: pb, status, ds }); };
  for (const s of cwsNodes) {
    const fids = groups[s.id] || [];
    if (fids.length) E("farmer:grp:" + s.id, "cws:" + s.id, "confirmed", "live");
  }
  for (const l of lots.slice(0, 120)) E("cws:" + l.attrs.cws_id, "lot:" + l.id, "confirmed", l.dataSource);
  for (const b of batches.slice(0, 120)) {
    for (const [lotId, batchIds] of Object.entries(lotBatch)) if (batchIds.includes(b.id)) E("lot:" + lotId, "batch:" + b.id, "confirmed", b.dataSource);
    if (b.attrs.exporter_id) E("batch:" + b.id, "exporter:" + b.attrs.exporter_id, "confirmed", b.dataSource);
    if (b.attrs.importer_id) E("batch:" + b.id, "importer:" + b.attrs.importer_id, "confirmed", b.dataSource);
  }

  const selKey = state.sel ? key(state.sel.model, state.sel.id) : null;
  const selGroup = state.sel ? (farmerStation[state.sel.id] ? "farmer:grp:" + farmerStation[state.sel.id] : null) : null;

  const svg = `
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(${tx},${ty}) scale(${k})">
      ${edges.map(e => {
        const hl = selKey && (e.a.model + ":" + e.a.id === selKey || e.b.model + ":" + e.b.id === selKey);
        const mx = (e.a.x + e.b.x) / 2;
        return `<path class="gedge ${hl ? "hl" : ""} ${e.ds === "indicative" ? "inf" : ""}" d="M${e.a.x},${e.a.y} C${mx},${e.a.y} ${mx},${e.b.y} ${e.b.x},${e.b.y}"/>`;
      }).join("")}
      ${Object.values(P).map(n => {
        const kk = n.model + ":" + n.id;
        const on = selKey === kk || selGroup === kk || (n.parent && selGroup === n.parent);
        const r = n.group ? 9 : on ? 7.5 : 5.5;
        const dash = n.dataSource === "indicative" ? 'stroke-dasharray="3 3"' : "";
        const stroke = n.dataSource === "indicative" ? "#9b958a" : "#fff";
        const label = n.model === "importer" ? "end" : "start";
        const lx = n.model === "importer" ? n.x - 12 : n.x + 12;
        return `<g class="gnode" data-t="${n.model}" data-id="${esc(n.group ? n.cwsId : n.id)}" data-group="${n.group ? "1" : ""}">
          <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${n.color}" stroke="${stroke}" stroke-width="2" ${dash}/>
          <text x="${lx}" y="${n.y + 4}" text-anchor="${label}">${esc(String(n.label).slice(0, 20))}</text>
          ${n.sub ? `<text x="${n.x}" y="${n.y + 18}" text-anchor="middle" font-size="9" fill="#9b958a">${esc(n.sub)}</text>` : ""}
        </g>`;
      }).join("")}
    </g>
  </svg>`;

  const gid = opts.id || "graphid";
  const host = document.getElementById(gid) || container;
  host.innerHTML = svg;

  const svgEl = host.querySelector("svg");
  const gEl = svgEl.querySelector("g");
  let dragging = false, lx0 = 0, ly0 = 0;
  svgEl.addEventListener("mousedown", e => { if (e.target.closest(".gnode")) return; dragging = true; lx0 = e.clientX; ly0 = e.clientY; svgEl.style.cursor = "grabbing"; });
  window.addEventListener("mouseup", () => { dragging = false; if (svgEl) svgEl.style.cursor = "grab"; });
  svgEl.addEventListener("mousemove", e => {
    if (!dragging) return;
    tx += (e.clientX - lx0) / k; ty += (e.clientY - ly0) / k; lx0 = e.clientX; ly0 = e.clientY;
    gEl.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`);
  });
  svgEl.addEventListener("wheel", e => { e.preventDefault(); k = Math.min(3, Math.max(0.35, k * (e.deltaY < 0 ? 1.1 : 0.9))); gEl.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`); }, { passive: false });
  svgEl.querySelectorAll(".gnode").forEach(node => node.addEventListener("click", () => {
    if (node.dataset.group) {
      const s = node.dataset.id;
      if (expanded.has(s)) expanded.delete(s); else expanded.add(s);
      render(container, opts);
      return;
    }
    if (window.__naeb_select) window.__naeb_select(node.dataset.t, node.dataset.id);
  }));
}

export function focusSelection() { tx = 20; ty = 20; k = 1; }
export { TYPE_LABEL };
