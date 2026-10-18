import { state, set } from "../../core/store.js";
import { esc } from "../components.js";
import { computeScope } from "../../data/chain.js";
import { render as renderGraph, setGraphExpanded } from "../../graph/graphView.js";

export function renderNetwork(container) {
  container.innerHTML = `
    <div class="card">
      <div class="ch" style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap">
        <span class="muted" id="nhint">Farmers are grouped per washing station — click a group to expand. Dashed outlines are indicative (demo) data.</span>
        <label style="margin:0;font-size:12px;display:flex;gap:6px;align-items:center">Depth
          <select id="ndepth" style="width:auto">${[1, 2, 3, 4].map(d => `<option value="${d}" ${state.graphDepth === d ? "selected" : ""}>${d}</option>`).join("")}</select>
        </label>
        <label class="checkline" style="margin:0"><input type="checkbox" id="nindu" ${state.showIndicative ? "checked" : ""}> Show indicative</label>
        <button id="nreset" class="ghost sm">Reset view</button>
      </div>
      <div id="graphid" style="height:calc(100vh - 260px);min-height:460px"></div>
    </div>`;
  const draw = () => {
    const scope = computeScope(state.sel, state.filters, { showIndicative: state.showIndicative });
    renderGraph(document.getElementById("graphid"), { id: "graphid", nodeSet: scope.nodeSet });
  };
  draw();
  document.getElementById("ndepth").onchange = e => set({ graphDepth: +e.target.value });
  document.getElementById("nindu").onchange = e => set({ showIndicative: e.target.checked });
  document.getElementById("nreset").onclick = () => setGraphExpanded(new Set());
}
