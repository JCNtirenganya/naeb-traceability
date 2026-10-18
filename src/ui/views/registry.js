import { state, set, select, RISK, emptyFilters } from "../../core/store.js";
import { token, role, can } from "../../core/auth.js";
import R, { models, recordsOf, getModel, get, titleOf, subtitleOf, cwsList, dataStatus } from "../../data/registry.js";
import { computeScope, traceFrom, unkey } from "../../data/chain.js";
import { esc, N, fmtDate, badge, riskPill, linkBadge, chip, emptyState, toast, combobox, confirmDialog, kpi, riskDot } from "../components.js";
import { buildReport, printReport } from "../../report/print.js";
import { downloadCsv } from "../../report/csv.js";

const SORT = { key: "title", dir: 1, per: {} };

export function renderRegistry(container, params = {}) {
  const mid = params.model || "farm";
  const model = getModel(mid) || models().find(m => m.kind !== "system-derived");
  if (!model) { container.innerHTML = emptyState("No models loaded."); return; }
  SORT.key = SORT.per[mid]?.key || "title";
  SORT.dir = SORT.per[mid]?.dir || 1;
  container.innerHTML = `<div class="splitwide">
    <div>
      <div class="toolbar">
        <div id="modeltabs" class="tabs"></div>
      </div>
      <div class="card pad" style="margin-bottom:12px">
        <div class="row" style="align-items:flex-end">
          <label style="flex:2;min-width:200px;margin:0">Search ${esc(model.plural)}
            <input id="rq" placeholder="Type to filter…" value="${esc(state.q)}">
          </label>
          <label style="min-width:130px;margin:0">Sort by
            <select id="rsort">${sortOptions(model).map(([k, l]) => `<option value="${k}" ${SORT.key === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          </label>
          <button id="rnew" class="sm" ${can("edit") ? "" : "hidden"}>+ Record ${esc(model.name)}</button>
          <button id="rprint" class="ghost sm">${esc(t2("print"))}</button>
          <button id="rcsv" class="ghost sm">${esc(t2("csv"))}</button>
        </div>
        <div id="filters" class="row" style="margin-top:10px"></div>
      </div>
      <div id="rlist"></div>
    </div>
    <div id="rprofile" class="card pad"></div>
  </div>`;

  renderModelTabs(mid);
  renderFilters();
  wireRegistry(model, mid);
  renderList(model, mid);
  renderProfilePanel();
  R.__registryRefresh = () => renderList(getModel(mid), mid);
}

function t2(k) { return { print: "Print / PDF", csv: "Export CSV" }[k]; }

function sortOptions(m) {
  const base = [["title", m.titleField], ["id", "ID"], ["dataSource", "Data source"]];
  for (const c of (m.listColumns || [])) {
    const f = m.fields.find(x => x.name === c);
    if (f && !base.some(b => b[0] === c)) base.push([c, f.label]);
  }
  return base;
}

function renderModelTabs(mid) {
  const el = document.getElementById("modeltabs");
  el.innerHTML = models().filter(m => m.kind !== "system-derived" || m.id === "farmer").map(m =>
    `<button data-m="${m.id}" class="${mid === m.id ? "on" : ""}">${esc(m.icon)} ${esc(m.plural)}</button>`).join("");
  el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { location.hash = "#/registry?model=" + b.dataset.m; });
}

function renderFilters() {
  const el = document.getElementById("filters");
  const districts = [...new Set([...R.records.farm, ...R.records.cws].map(r => r.attrs.district).filter(Boolean))].sort();
  el.innerHTML = `
    <label style="min-width:150px;margin:0">Data source
      <select id="ff_source">${["", "live", "recorded", "indicative"].map(v => `<option value="${v}" ${state.filters.source === v ? "selected" : ""}>${v || "All sources"}</option>`).join("")}</select>
    </label>
    <label style="min-width:150px;margin:0">District
      <select id="ff_district"><option value="">All districts</option>${districts.map(d => `<option value="${esc(d)}" ${state.filters.district === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
    </label>
    <label style="min-width:130px;margin:0">Risk
      <select id="ff_risk">${["", "low", "review", "blocked"].map(v => `<option value="${v}" ${state.filters.risk === v ? "selected" : ""}>${v || "All risk"}</option>`).join("")}</select>
    </label>
    <label style="min-width:130px;margin:0">From
      <input type="date" id="ff_from" value="${esc(state.filters.from)}">
    </label>
    <label style="min-width:130px;margin:0">To
      <input type="date" id="ff_to" value="${esc(state.filters.to)}">
    </label>
    <button id="ff_clear" class="ghost sm">Clear filters</button>`;
  for (const [id, key] of [["ff_source", "source"], ["ff_district", "district"], ["ff_risk", "risk"], ["ff_from", "from"], ["ff_to", "to"]]) {
    const el2 = document.getElementById(id);
    el2.onchange = () => { state.filters[key] = el2.value; const m = getModel(currentMid()); renderList(m, currentMid()); renderProfilePanel(); };
  }
  document.getElementById("ff_clear").onclick = () => { state.filters = emptyFilters(); renderFilters(); renderList(getModel(currentMid()), currentMid()); renderProfilePanel(); };
}

let _mid = null;
function currentMid() { return _mid; }

function wireRegistry(model, mid) {
  _mid = mid;
  document.getElementById("rq").oninput = e => { state.q = e.target.value; renderList(model, mid); };
  document.getElementById("rsort").onchange = e => { SORT.key = e.target.value; SORT.per[mid] = { key: e.target.value, dir: SORT.dir }; renderList(model, mid); };
  const nb = document.getElementById("rnew");
  if (nb) nb.onclick = () => { location.hash = `#/edit/${model.id}`; };
  document.getElementById("rprint").onclick = () => doPrint(() => printReport());
  document.getElementById("rcsv").onclick = () => doPrint(() => downloadCsv());
}

function doPrint(fn) {
  if (!state.sel) {
    if (!confirmScope()) return;
  }
  fn();
  if (fn === printReport) setTimeout(() => window.print(), 60);
}
function confirmScope() { return confirm("No selection — this covers the whole network under the current filters. Continue?"); }

function sortVal(rec, key) {
  if (key === "title") return titleOf(getModel(rec.modelId), rec).toLowerCase();
  if (key === "id") return rec.id;
  if (key === "dataSource") return rec.dataSource;
  return rec.attrs?.[key] ?? "";
}

export function visibleRecords(model) {
  const scope = computeScope(null, {}, { showIndicative: state.showIndicative });
  let recs = recordsOf(model.id).filter(r => !(model.softDelete && r.attrs[model.softDelete] === 0));
  if (model.kind === "recordable" && !model.url) recs = recs;
  // apply filters
  const f = state.filters;
  recs = recs.filter(r => {
    if (f.source && r.dataSource !== f.source) return false;
    if (f.district && r.attrs.district !== f.district) return false;
    if (f.risk && model.id === "farm" && r.risk !== f.risk) return false;
    const dt = String(r.attrs.delivery_date || r.attrs.ship_date || r.attrs.created_date || "").slice(0, 10);
    if (f.from && dt && dt < f.from) return false;
    if (f.to && dt && dt > f.to) return false;
    return true;
  });
  const q = state.q.toLowerCase().trim();
  if (q) recs = recs.filter(r => (titleOf(model, r) + " " + r.id + " " + (subtitleOf(model, r) || "")).toLowerCase().includes(q));
  recs.sort((a, b) => { const av = sortVal(a, SORT.key), bv = sortVal(b, SORT.key); return (av > bv ? 1 : av < bv ? -1 : 0) * SORT.dir; });
  return recs;
}

function renderList(model, mid) {
  const recs = visibleRecords(model);
  const el = document.getElementById("rlist");
  if (!recs.length) { el.innerHTML = emptyState(state.q ? "No matches for your search." : "Nothing to show."); return; }
  const cols = model.listColumns && model.listColumns.length ? model.listColumns : model.fields.slice(0, 4).map(f => f.name);
  const head = ["", model.titleField || "id", ...cols.filter(c => c !== model.titleField), "Data source", ...(model.id === "farm" ? ["Risk"] : [])];
  const rows = recs.slice(0, 400).map(r => {
    const on = state.sel && state.sel.model === model.id && state.sel.id === r.id;
    const cell = c => {
      const f = model.fields.find(x => x.name === c);
      let v = r.attrs?.[c];
      if (f?.type === "lookup") { const tm = getModel(f.model), tgt = get(tm.id, v); v = tgt ? titleOf(tm, tgt) : v; }
      if (f?.type === "boolean") v = v ? "Yes" : "No";
      if (f?.type === "choice") v = f.choices?.find(cc => cc.value === v)?.label || v;
      if (f?.type === "date" || f?.type === "datetime") v = fmtDate(v);
      return v == null || v === "" ? "—" : String(v);
    };
    return `<tr class="${on ? "on" : ""} ${r.dataSource === "indicative" ? "indicative" : ""}" data-model="${model.id}" data-id="${esc(r.id)}">
      <td>${model.id === "farm" ? riskDot(r.risk) : `<i class="dot" style="background:${r.dataSource === "live" ? "#2f6b4f" : r.dataSource === "recorded" ? "#3b6ea5" : "#9b958a"}"></i>`}</td>
      <td><b>${esc(titleOf(model, r))}</b></td>
      ${cols.filter(c => c !== model.titleField).map(c => `<td>${esc(cell(c))}</td>`).join("")}
      <td>${badge(r.dataSource)}</td>
      ${model.id === "farm" ? `<td>${riskPill(r.risk)}</td>` : ""}
    </tr>`;
  }).join("");
  el.innerHTML = `<div class="tablewrap"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <div class="tablefoot">${N(recs.length)} record(s)${recs.length > 400 ? ` · showing first 400 — refine filters` : ""}</div></div>`;
  el.querySelectorAll("tbody tr").forEach(tr => tr.onclick = () => { select(tr.dataset.model, tr.dataset.id); });
}

export function renderProfilePanel() {
  const el = document.getElementById("rprofile");
  if (!el) return;
  el.innerHTML = state.sel ? profileHtml(state.sel) : emptyState("Select a row to see its profile.");
  wireProfile(el);
}

export function profileHtml(sel) {
  const model = getModel(sel.model);
  const rec = get(sel.model, sel.id);
  if (!rec) return emptyState("Record not found.");
  const attrs = rec.attrs || {};
  const links = neighbourLinks(sel);
  const metrics = model.kind === "system-live" && sel.model === "cws" ? cwsMetrics(rec) : (sel.model === "farm" ? farmMetrics(rec) : (sel.model === "farmer" ? farmerMetrics(rec) : null));
  const rows = (model.profileFields || model.fields.map(f => f.name)).map(name => {
    const f = model.fields.find(x => x.name === name);
    let v = attrs[name];
    if (f?.type === "lookup") { const tm = getModel(f.model), tgt = get(tm.id, v); v = tgt ? chip(tm.id, tgt.id, titleOf(tm, tgt)) : (v ? esc(v) : "—"); return `<dt>${esc(f.label)}</dt><dd>${v}</dd>`; }
    if (f?.type === "boolean") v = v ? "Yes" : "No";
    if (f?.type === "choice") v = f.choices?.find(c => c.value === v)?.label || v;
    if (f?.type === "date" || f?.type === "datetime") v = fmtDate(v);
    return `<dt>${esc(f?.label || name)}</dt><dd>${esc(v == null || v === "" ? "—" : v)}</dd>`;
  }).join("");
  const audit = auditHtml(rec);
  return `<div class="profile">
    <div class="row"><small class="muted">${esc(model.name.toUpperCase())}</small>${badge(rec.dataSource)}${rec.risk ? riskPill(rec.risk) : ""}</div>
    <h3 style="margin-top:6px">${esc(titleOf(model, rec))}</h3>
    ${metrics || ""}
    <dl>${rows}</dl>
    ${tagsHtml(rec)}
    ${links}
    ${audit}
    <div class="row" style="margin-top:12px">
      <button class="ghost sm" data-pact="print">${esc(t2("print"))}</button>
      ${can("edit") && model.kind === "recordable" && model.url ? `<button class="ghost sm" data-pact="edit">Edit</button>` : ""}
      ${can("admin") && model.kind === "recordable" && model.url ? `<button class="ghost sm" data-pact="delete">Delete</button>` : ""}
      ${can("edit") && model.kind === "recordable" && !model.url ? `<div class="mini" style="width:100%;margin-top:4px">Demo model — publish it in Admin to record real rows.</div>` : ""}
    </div>
  </div>`;
}

function tagsHtml(rec) {
  const a = rec.attrs || {};
  const tags = [];
  if (rec.risk === "blocked") tags.push(`<span class="badge indicative">Overlap</span>`);
  if (rec.modelId === "farm" && a.prior_land_use) tags.push(`<span class="badge recorded">${esc(a.prior_land_use)}</span>`);
  if (String(a.notes || "")) tags.push(`<span class="chip">note</span>`);
  return tags.length ? `<div class="chips">${tags.join("")}</div>` : "";
}

function auditHtml(rec) {
  const items = [];
  if (rec.createdBy) items.push(`Created by <b>${esc(rec.createdBy)}</b> ${rec.createdDate ? fmtDate(rec.createdDate) : ""}`);
  if (rec.editedBy) items.push(`Edited by <b>${esc(rec.editedBy)}</b> ${rec.editedDate ? fmtDate(rec.editedDate) : ""}`);
  if (rec.demo) items.push(`Demonstration record — not backed by the portal.`);
  if (!items.length) return "";
  return `<h4 style="margin:12px 0 4px">Activity</h4><ul class="audit">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

function neighbourLinks(sel) {
  const t = traceFrom(sel.model, sel.id, 8);
  const groups = {};
  for (const k of t.nodes) {
    const { model, id } = unkey(k);
    if (model === sel.model && id === sel.id) continue;
    if (["lot_delivery", "batch_lot"].includes(model)) continue;
    (groups[model] = groups[model] || []).push(id);
  }
  const order = ["farmer", "farm", "cws", "delivery", "lot", "batch", "exporter", "importer"];
  const rows = order.filter(m => groups[m]?.length).map(m => {
    const mm = getModel(m);
    const ids = [...new Set(groups[m])].slice(0, 30);
    const chips = ids.map(id => { const r = get(m, id); return chip(m, id, r ? titleOf(mm, r) : id); }).join("");
    return `<dt>${esc(mm.plural)}</dt><dd>${chips}${groups[m].length > 30 ? ` <span class="mini">+${groups[m].length - 30} more</span>` : ""}</dd>`;
  });
  if (!rows.length) return "";
  return `<h4 style="margin:12px 0 4px">Linked entities</h4><dl>${rows.join("")}</dl><div class="mini">Chain source: <b>${esc(t.chainSource)}</b> · inferred links may appear on the map</div>`;
}

let _chainMod = null;
export function injectChain(mod) { _chainMod = mod; }

function cwsMetrics(rec) {
  const scope = computeScope({ model: "cws", id: rec.id }, {}, { showIndicative: state.showIndicative });
  const farms = (scope.byModel.farm || []).map(e => e.rec);
  const farmers = new Set(farms.map(f => f.attrs.farmer_id)).size;
  const low = farms.filter(f => f.risk === "low").length;
  const batches = scope.byModel.batch?.length || 0;
  return `<div class="metrics">${kpi(N(farmers), "Farmers")}${kpi(N(farms.length), "Farms")}${kpi(N(farms.reduce((t, f) => t + (f.attrs.area_ha || 0), 0).toFixed(0)), "ha")}${kpi(N(batches), "Batches")}${kpi(farms.length ? Math.round(100 * low / farms.length) + "%" : "—", "Low risk")}</div>`;
}
function farmMetrics(rec) {
  return `<div class="metrics">${kpi(rec.attrs.area_ha ?? "—", "ha")}${kpi(N(rec.attrs.trees_total), "Trees")}${kpi(N(rec.attrs.prod_kg_2025), "kg 2025")}${kpi(esc(rec.attrs.first_planting_year || "—"), "First planted")}</div>`;
}
function farmerMetrics(rec) {
  return `<div class="metrics">${kpi(N(rec.attrs.plot_count), "Plots")}${kpi(rec.attrs.area_ha ?? "—", "ha")}${kpi(N(rec.attrs.prod_kg), "kg 2025")}</div>`;
}

function wireProfile(el) {
  el.querySelectorAll("[data-pact]").forEach(b => b.onclick = async () => {
    const act = b.dataset.pact;
    if (act === "print") { buildReport(); window.print(); }
    if (act === "edit") location.hash = `#/edit/${state.sel.model}/${state.sel.id}`;
    if (act === "delete") {
      const { softDelete } = await import("../data/registry.js");
      const ok = await confirmDialog("Soft-delete this record? It stays in ArcGIS for the audit trail but is hidden here. Admin only.", "Delete");
      if (!ok) return;
      try { await softDelete(state.sel.model, state.sel.id); toast("Record deactivated", "ok"); if (R.__registryRefresh) R.__registryRefresh(); renderProfilePanel(); }
      catch (e) { toast(esc(e.message), "bad"); }
    }
  });
}

export function renderProfilePage(container, params) {
  const sel = { model: params.rest[0], id: params.rest[1] };
  state.sel = sel;
  container.innerHTML = `<div class="card pad" style="max-width:900px;margin:0 auto">${profileHtml(sel)}</div>`;
  wireProfile(container);
}
