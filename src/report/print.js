import { state } from "../core/store.js";
import { computeScope, scopeDescription, farmsOfBatch } from "../data/chain.js";
import R, { getModel, get, titleOf, recordsOf } from "../data/registry.js";
import { esc, N, fmtDate, RISK_LABEL, badge, linkBadge } from "../ui/components.js";
import { hashStr } from "../data/demo.js";

function fieldLabel(m, name) { return m.fields.find(f => f.name === name)?.label || name; }

function cellVal(m, rec, name) {
  let v = rec.attrs?.[name];
  if (name === "data_source") return rec.dataSource;
  const f = m.fields.find(x => x.name === name);
  if (f?.type === "lookup") {
    const tm = getModel(f.model);
    const target = get(f.model, v);
    return target ? titleOf(tm, target) : (v || "—");
  }
  if (f?.type === "boolean") return v ? "Yes" : "No";
  if (f?.type === "choice") return f.choices?.find(c => c.value === v)?.label || v || "—";
  if (f?.type === "date" || f?.type === "datetime") return fmtDate(v);
  return v == null || v === "" ? "—" : String(v);
}

const REL_SECTIONS = [
  ["farm", "Farms (plots) in scope"], ["farmer", "Farmers in scope"], ["cws", "Washing stations"],
  ["delivery", "Cherry deliveries"], ["lot", "Lots"], ["lot_delivery", "Lot–delivery links"],
  ["batch", "Export batches"], ["batch_lot", "Batch–lot links"],
  ["exporter", "Exporters"], ["importer", "Importers"]
];

export function buildReport() {
  const sel = state.sel;
  const scope = computeScope(sel, state.filters, { showIndicative: state.showIndicative });
  const d = new Date();
  const rid = "RPT-" + hashStr(d.toISOString() + JSON.stringify(sel) + scope.entities.length).toString(36).toUpperCase();
  const prov = scope.provenance || {};
  const provLine = ["live", "recorded", "indicative"].filter(x => prov[x]).map(x => `${N(prov[x])} ${x}`).join(" · ") || "none";
  const scopeLine = scopeDescription(sel, state.filters);

  const parts = [];
  parts.push(`<div class="pgbreak">
    <h1>EUDR due-diligence pre-screening report — Rwandan coffee (HS 0901)</h1>
    <p><b>Report ID:</b> ${esc(rid)} &nbsp;·&nbsp; <b>Generated:</b> ${d.toISOString().replace("T", " ").slice(0, 16)} UTC</p>
    <p><b>Scope:</b> ${esc(scopeLine)}</p>
    <p><b>Data provenance:</b> ${esc(provLine)} &nbsp;·&nbsp; overall chain source: <b>${esc(scope.chainSource)}</b>${sel ? "" : " &nbsp;·&nbsp; " + esc(scopeDescription(null, {}))}</p>
    <p><i>This is a pre-screening aid based on the data available in the system. It is not a legal EUDR due-diligence determination. Satellite deforestation verification (cut-off 31 Dec 2020) remains pending where not stated otherwise.</i></p>
  </div>`);

  parts.push(`<h2>1 · Summary</h2>`);
  const counts = REL_SECTIONS.map(([m]) => [getModel(m)?.plural || m, (scope.byModel[m] || []).length]);
  parts.push(`<table><thead><tr>${counts.map(c => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
    <tbody><tr>${counts.map(c => `<td>${N(c[1])}</td>`).join("")}</tr></tbody></table>`);

  if (scope.byModel.farm?.length) {
    const farms = scope.byModel.farm.map(e => e.rec);
    const c = { low: 0, review: 0, blocked: 0 };
    farms.forEach(f => { if (c[f.risk] != null) c[f.risk]++; });
    parts.push(`<h2>2 · Risk assessment (plots in scope)</h2>`);
    parts.push(`<table><thead><tr><th>Status</th><th>Farms</th><th>Share</th></tr></thead><tbody>
      ${Object.entries(c).map(([kk, v]) => `<tr><td>${RISK_LABEL[kk]}</td><td>${N(v)}</td><td>${farms.length ? Math.round(100 * v / farms.length) + "%" : "—"}</td></tr>`).join("")}
    </tbody></table>`);
    const why = {};
    farms.forEach(f => { if (f.risk !== "low") why[f.why] = (why[f.why] || 0) + 1; });
    if (Object.keys(why).length)
      parts.push(`<table style="margin-top:6px"><thead><tr><th>Pre-screening flag</th><th>Farms</th></tr></thead><tbody>${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([w, v]) => `<tr><td>${esc(w)}</td><td>${N(v)}</td></tr>`).join("")}</tbody></table>`);
    parts.push(`<p>Conclusion: ${c.blocked || c.review ? "farms flagged above require resolution before a DDS can be relied on." : "no pre-screening flags on the plots in scope."} <b>${esc("Pre-screening only — not a legal determination.")}</b></p>`);
  }

  parts.push(`<h2>3 · Chain of custody — confirmed vs inferred</h2>`);
  const edges = scope.edges || [];
  const confirmed = edges.filter(e => e.status === "confirmed");
  const inferred = edges.filter(e => e.status === "inferred");
  parts.push(`<p><b>${N(confirmed.length)}</b> confirmed links (backed by delivery / lot / batch records) and <b>${N(inferred.length)}</b> inferred links (station association without a delivery record). Inferred links are shown separately and must not be treated as verified.</p>`);
  if (inferred.length) {
    const seen = new Set();
    const rows = [];
    for (const e of inferred) {
      const a = e.from.split(":")[0], b = e.to.split(":")[0];
      const kk = a + "→" + b + (e.label || "");
      if (seen.has(kk)) continue; seen.add(kk);
      rows.push([`${a} → ${b}`, e.label || "", N(inferred.filter(x => x.from.split(":")[0] === a && x.to.split(":")[0] === b).length)]);
    }
    parts.push(`<table><thead><tr><th>Link type</th><th>Basis</th><th>Count</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map(cc => `<td>${esc(cc)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
  }

  let sec = 4;
  for (const [model, heading] of REL_SECTIONS) {
    const arr = scope.byModel[model];
    if (!arr || !arr.length) continue;
    const m = getModel(model);
    const cols = (m.listColumns && m.listColumns.length ? m.listColumns : m.fields.slice(0, 5).map(f => f.name));
    const head = ["ID", ...cols.map(c => fieldLabel(m, c)), "Data source", "Link", ...(model === "farm" ? ["Risk"] : [])];
    const rows = arr.map(({ rec, linkStatus }) => {
      const base = [rec.id, ...cols.map(c => cellVal(m, rec, c)), rec.dataSource, linkStatus];
      if (model === "farm") base.push(RISK_LABEL[rec.risk] || "");
      return base;
    });
    parts.push(`<h2>${sec++} · ${esc(heading)} <small style="font-weight:400">(${N(arr.length)})</small></h2>`);
    parts.push(`<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r => `<tr class="pgbreak">${r.map(c => `<td>${esc(c ?? "")}</td>`).join("")}</tr>`).join("")}
    </tbody></table>`);
  }

  parts.push(`<p style="margin-top:16px"><i>Exporters, importers, lots, deliveries and batches shown as <b>indicative</b> are demonstration data generated until real records are entered. Only rows tagged <b>live</b> or <b>recorded</b> reflect actual data. Risk flags are pre-screening only.</i></p>`);

  const report = document.getElementById("report");
  report.innerHTML = parts.join("\n");
  return { rid, scope, scopeLine };
}

export function printReport({ force = false } = {}) {
  return buildReport();
}
