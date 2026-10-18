import { state } from "../core/store.js";
import { computeScope, scopeDescription } from "../data/chain.js";
import { getModel, get, titleOf } from "../data/registry.js";
import { fmtDate } from "../ui/components.js";

function q(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

export function buildCsv() {
  const scope = computeScope(state.sel, state.filters, { showIndicative: state.showIndicative });
  const head = ["entity_type", "record_id", "title", "data_source", "link_status", "chain_source", "scope", "details"];
  const rows = [];
  for (const e of scope.entities) {
    const m = getModel(e.model);
    const details = Object.entries(e.rec.attrs || {})
      .filter(([kk, v]) => v !== null && v !== "" && kk !== "data_source" && !String(kk).startsWith("Creation"))
      .map(([kk, v]) => {
        const f = m?.fields.find(x => x.name === kk);
        let val = v;
        if (f?.type === "lookup") { const t = get(f.model, v); val = t ? titleOf(getModel(f.model), t) : v; }
        if (f?.type === "date" || f?.type === "datetime") val = fmtDate(v);
        return `${kk}=${val}`;
      }).join("; ");
    rows.push([e.model, e.rec.id, titleOf(m, e.rec), e.rec.dataSource, e.linkStatus, scope.chainSource, scopeDescription(state.sel, state.filters), details]);
  }
  return [head, ...rows].map(r => r.map(q).join(",")).join("\r\n");
}

export function downloadCsv() {
  const p = buildReportName();
  const blob = new Blob(["\uFEFF" + buildCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = p;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function buildReportName() {
  const sel = state.sel ? `${state.sel.model}-${state.sel.id}`.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40) : "full-network";
  return `eudr-scope-${sel}-${new Date().toISOString().slice(0, 10)}.csv`;
}
