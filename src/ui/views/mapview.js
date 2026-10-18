import { state, set, RISK } from "../../core/store.js";
import { token } from "../../core/auth.js";
import { esc } from "../components.js";
import { computeScope } from "../../data/chain.js";
import R from "../../data/registry.js";
import { initMap, renderFarms, highlightSelection, fitToStations, invalidate } from "../../map/farmsLayer.js";
import { render as renderGraph } from "../../graph/graphView.js";

function currentScope() {
  return computeScope(state.sel, state.filters, { showIndicative: state.showIndicative });
}

export function renderMap(container) {
  if (container.__mapview) {
    container.__mapview.draw();
    return;
  }
  container.innerHTML = `
  <div class="mapcard card" id="mapcard">
    <div class="ch">
      <div class="seg"><button data-v="map" class="on">Map</button><button data-v="graph">Graph</button></div>
      <span class="muted" id="mhint">Farm polygons load from login and stay visible; selection highlights the chain.</span>
      <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:12px">Colour by
        <select id="mcolour" style="width:auto">
          <option value="eudr">EUDR status</option>
          <option value="first_planting_year">Year planted</option>
          <option value="area">Area</option>
          <option value="district">District</option>
        </select>
      </label>
      <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:12px">Mapped
        <input type="date" id="mfrom" style="width:auto">–<input type="date" id="mto" style="width:auto">
      </label>
      <button id="mfit" class="ghost sm">Fit stations</button>
      <button id="mfull" class="ghost sm" title="Fullscreen">⤢</button>
    </div>
    <div id="mapid"></div>
    <div id="graphid" hidden></div>
    <div class="legend">
      ${Object.entries({ low: "Low risk", review: "Needs review", blocked: "Blocked", none: "No farm data" }).map(([k, l]) =>
    `<span><i class="dot" style="background:${RISK[k]}"></i> ${esc(l)}</span>`).join("")}
      <span class="muted" style="margin-left:auto"><span class="badge live">live</span> <span class="badge recorded">recorded</span> <span class="badge indicative">indicative</span> Stations are blue circles · farms coloured by your choice.</span>
    </div>
  </div>`;

  const signed = !!token();
  initMap("mapid");

  const draw = () => {
    const scope = currentScope();
    const selKeys = new Set([...scope.nodeSet]);
    renderFarms(selKeys, (scope.byModel.farm || []).map(e => e.rec.id));
    highlightSelection(state.sel ? new Set([state.sel.model + ":" + state.sel.id]) : null);
    if (!document.getElementById("graphid").hidden) renderGraph(document.getElementById("graphid"), { id: "graphid", nodeSet: scope.nodeSet });
  };

  if (!signed) {
    document.getElementById("mapid").innerHTML = `<div class="empty" style="padding:60px 20px"><div class="big">🔒</div><p>Sign in to load farm polygons. Washing stations are shown for everyone.</p></div>`;
  } else if (!(R.records.cws || []).length) {
    document.getElementById("mapid").innerHTML = `<div class="empty" style="padding:60px 20px"><p>Loading stations…</p></div>`;
  }

  const cws = R.records.cws || [];
  setTimeout(() => { invalidate(); draw(); if (cws.length) fitToStations(); }, 80);

  const colSel = document.getElementById("mcolour");
  colSel.value = state.colourBy;
  colSel.onchange = e => set({ colourBy: e.target.value });
  document.getElementById("mfrom").value = state.timeline.from;
  document.getElementById("mto").value = state.timeline.to;
  document.getElementById("mfrom").onchange = e => { state.timeline.from = e.target.value; draw(); };
  document.getElementById("mto").onchange = e => { state.timeline.to = e.target.value; draw(); };
  document.getElementById("mfit").onclick = () => fitToStations();
  document.getElementById("mfull").onclick = () => { document.getElementById("mapcard").classList.toggle("full"); setTimeout(() => invalidate(), 60); };
  container.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    container.querySelectorAll("[data-v]").forEach(x => x.classList.toggle("on", x === b));
    document.getElementById("mapid").hidden = v !== "map";
    document.getElementById("graphid").hidden = v !== "graph";
    if (v === "map") { invalidate(); draw(); } else renderGraph(document.getElementById("graphid"), { id: "graphid", nodeSet: currentScope().nodeSet });
  });

  container.__mapview = { draw };
}
