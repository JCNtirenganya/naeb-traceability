import { state } from "../../core/store.js";
import { token, user, role } from "../../core/auth.js";
import R, { models, recordsOf, getModel, cwsList, dataStatus, titleOf, get } from "../../data/registry.js";
import { computeScope } from "../../data/chain.js";
import { esc, N, kpi, badge, emptyState, riskDot } from "../components.js";

export function renderOverview(container) {
  const signed = !!token();
  const farms = R.records.farm || [];
  const farmers = R.farmers || [];
  const cws = cwsList();
  const scope = computeScope(null, {}, { showIndicative: state.showIndicative });
  const prov = scope.provenance || {};
  const deliveries = recordsOf("delivery");
  const lots = recordsOf("lot");
  const batches = recordsOf("batch");

  const farmSplit = `${farms.length ? "100% live" : "—"}`;
  const chainSplit = (arr) => {
    if (!arr.length) return "none";
    const counts = {};
    arr.forEach(r => counts[r.dataSource] = (counts[r.dataSource] || 0) + 1);
    return Object.entries(counts).map(([k, v]) => `${N(v)} ${k}`).join(" · ");
  };

  container.innerHTML = `
  ${!signed ? `<div class="notice">Sign in with your NAEB portal account to load farm polygons and record data. Washing stations are public.</div>` : ""}
  <div class="kpis">
    ${kpi(N(farmers.length), "Farmers", "live")}
    ${kpi(N(farms.length), "Farm plots", farmSplit)}
    ${kpi(N(farms.reduce((t, f) => t + (f.attrs.area_ha || 0), 0).toFixed(0)), "Mapped hectares", "live")}
    ${kpi(N(cws.length), "Washing stations", "live")}
    ${kpi(N(deliveries.length), "Cherry deliveries", chainSplit(deliveries))}
    ${kpi(N(lots.length), "Lots", chainSplit(lots))}
    ${kpi(N(batches.length), "Export batches", chainSplit(batches))}
    ${kpi(farms.length ? Math.round(100 * farms.filter(f => f.risk === "low").length / farms.length) + "%" : "—", "Low-risk plots", "pre-screening")}
  </div>

  <div class="grid g3">
    <div class="card pad">
      <h2>Chain of custody</h2>
      <div class="steps" style="flex-direction:column">
        ${[["Farmer & plot", `${N(farmers.length)} farmers · ${N(farms.length)} plots`, "live"],
           ["Cherry delivery", `${N(deliveries.length)} recorded`, "recorded"],
           ["Lot (parchment)", `${N(lots.length)} lots`, chainSplit(lots)],
           ["Export batch", `${N(batches.length)} batches`, chainSplit(batches)],
           ["EU importer", `${N(scope.byModel.importer?.length || 0)} importers`, "indicative"]]
          .map(([a, b, c]) => `<div class="step"><b>${esc(a)}</b>${esc(b)}</div>`).join("")}
      </div>
    </div>

    <div class="card pad">
      <h2>Data status</h2>
      <div class="provenance">${esc("Every model is live, recorded or still demonstration data.")}</div>
      ${dataStatus().map(s => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
        <span>${esc(s.model.icon)} ${esc(s.model.plural)}</span>
        <span>${badge(s.source)} <span class="mini">${N(s.count)}</span></span>
      </div>`).join("")}
    </div>

    <div class="card pad">
      <h2>Get started</h2>
      <div class="row">
        <button data-go="registry">Browse registry</button>
        <button data-go="map" class="ghost">Open map</button>
        <button data-go="network" class="ghost">Open network</button>
        ${role() !== "viewer" ? `<button data-go="edit/delivery" class="ghost">Record a cherry delivery</button>` : ""}
        ${role() === "admin" ? `<button data-go="admin" class="ghost">Admin</button>` : ""}
      </div>
      <hr class="sep">
      <p class="mini">${esc("Provenance in current view:")} <b>${N(prov.live || 0)}</b> live · <b>${N(prov.recorded || 0)}</b> recorded · <b>${N(prov.indicative || 0)}</b> indicative.</p>
      <p class="mini">${esc("Risk flags are a pre-screening aid, not a legal EUDR determination.")}</p>
    </div>
  </div>`;

  container.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { location.hash = "#/" + b.dataset.go; });
}
