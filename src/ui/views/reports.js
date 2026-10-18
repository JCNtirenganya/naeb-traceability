import { state } from "../../core/store.js";
import { token, role } from "../../core/auth.js";
import { computeScope, scopeDescription } from "../../data/chain.js";
import { dataStatus } from "../../data/registry.js";
import { esc, N, badge, emptyState, notice } from "../components.js";
import { buildReport, printReport } from "../../report/print.js";
import { downloadCsv } from "../../report/csv.js";

export function renderReports(container) {
  const scope = computeScope(state.sel, state.filters, { showIndicative: state.showIndicative });
  const prov = scope.provenance || {};
  const rows = [...(scope.entities || [])].slice(0, 60);
  container.innerHTML = `
  <div class="toolbar">
    <button id="rpprint">${esc("Print / PDF report")}</button>
    <button id="rpcsv" class="ghost">${esc("Export CSV (scope)")}</button>
    <button id="rpprofile" class="ghost" ${state.sel ? "" : "disabled"}>Print selected profile</button>
    <span class="spacer"></span>
    <span class="mini">${esc("Scope follows your selection and filters.")}</span>
  </div>
  ${!state.sel ? notice(`No selection — the report will cover the <b>full network under current filters</b> (${esc(scopeDescription(null, state.filters))}).`, "") : ""}
  <div class="grid g2">
    <div class="card pad">
      <h2>Scope preview</h2>
      <div class="provenance">${esc(scopeDescription(state.sel, state.filters))}</div>
      <div class="metrics">
        ${["farm", "farmer", "cws", "delivery", "lot", "batch", "exporter", "importer"].map(m =>
        `<div class="k"><b>${N((scope.byModel[m] || []).length)}</b><span>${esc(m)}</span></div>`).join("")}
      </div>
      <p class="mini">Chain source: <b>${esc(scope.chainSource)}</b> · Provenance: <b>${N(prov.live || 0)}</b> live · <b>${N(prov.recorded || 0)}</b> recorded · <b>${N(prov.indicative || 0)}</b> indicative.</p>
      <p class="mini">${esc("Risk flags are pre-screening, not a legal EUDR determination.")}</p>
    </div>
    <div class="card pad">
      <h2>Data status by model</h2>
      ${dataStatus().map(s => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
        <span>${esc(s.model.plural)}</span><span>${badge(s.source)} <span class="mini">${N(s.count)}</span></span></div>`).join("")}
    </div>
  </div>
  <div class="card pad" style="margin-top:12px">
    <h2>Records in scope <span class="muted" style="font-weight:400">(${N(scope.entities.length)})</span></h2>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Type</th><th>Title</th><th>ID</th><th>Data source</th><th>Link</th></tr></thead>
      <tbody>${rows.map(e => `<tr><td>${esc(e.model)}</td><td>${esc(e.rec.attrs?.name || e.rec.attrs?.plot_id || e.rec.attrs?.lot_id || e.rec.attrs?.batch_id || e.rec.attrs?.delivery_id || e.id)}</td><td>${esc(e.id)}</td><td>${badge(e.rec.dataSource)}</td><td>${esc(e.linkStatus)}</td></tr>`).join("")}</tbody></table>
      <div class="tablefoot">${scope.entities.length > 60 ? `Showing first 60 of ${N(scope.entities.length)} — the printed report and CSV contain everything in scope.` : N(scope.entities.length) + " record(s)."}</div></div>`
      : emptyState("Nothing in scope. Select an entity or adjust filters.")}
  </div>`;

  document.getElementById("rpprint").onclick = () => { buildReport(); setTimeout(() => window.print(), 60); };
  document.getElementById("rpcsv").onclick = () => downloadCsv();
  document.getElementById("rpprofile").onclick = () => { buildReport(); setTimeout(() => window.print(), 60); };
}
