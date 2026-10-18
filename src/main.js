import { state, select, applyTheme, on, emit } from "./core/store.js";
import { initRouter, syncSelectionToHash } from "./core/router.js";
import { ensureRestored, onAuthChange, token } from "./core/auth.js";
import { init, ensureDemoSuite, loadAfterSignIn } from "./data/registry.js";
import { buildGraph } from "./data/chain.js";
import { refreshHeader, wireHeader, renderNav } from "./ui/shell.js";
import { esc, toast } from "./ui/components.js";
import { renderOverview } from "./ui/views/overview.js";
import { renderMap } from "./ui/views/mapview.js";
import { renderNetwork } from "./ui/views/network.js";
import { renderRegistry, renderProfilePage } from "./ui/views/registry.js";
import { renderRecord } from "./ui/views/record.js";
import { renderReports } from "./ui/views/reports.js";
import { renderForms } from "./ui/views/forms.js";
import { renderAdmin } from "./ui/views/admin.js";
import { initForms } from "./data/forms.js";

const main = document.getElementById("main");
let booted = false;

window.__naeb_select = (model, id) => {
  const view = state.view;
  if (!["map", "network", "registry", "batches"].includes(view)) {
    location.hash = `#/view/${model}/${encodeURIComponent(id)}`;
    select(model, id);
  } else {
    select(model, id);
    syncSelectionToHash();
  }
};

function currentRest() { return location.hash.replace(/^#\/?/, "").split("?")[0].split("/").slice(1); }
function currentParams() { return Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")); }

let renderToken = 0;
export function renderCurrent(full = true) {
  if (!booted) return;
  const view = state.view;
  renderNav(view);
  refreshHeader();
  switch (view) {
    case "overview": renderOverview(main); break;
    case "map": renderMap(main); break;
    case "network": renderNetwork(main); break;
    case "registry": renderRegistry(main, currentParams()); break;
    case "batches": renderRegistry(main, { model: "batch" }); break;
    case "reports": renderReports(main); break;
    case "forms": renderForms(main, { rest: currentRest() }); break;
    case "admin": renderAdmin(main, { params: currentParams() }); break;
    case "view": renderProfilePage(main, { rest: currentRest() }); break;
    case "edit": case "record": renderRecord(main, { rest: currentRest() }); break;
    default: renderOverview(main);
  }
}

// Global click delegation for chips
document.addEventListener("click", e => {
  const chip = e.target.closest(".chip[data-t]");
  if (chip) { e.preventDefault(); window.__naeb_select(chip.dataset.t, chip.dataset.id); }
});

async function syncAuth() {
  try {
    await loadAfterSignIn();
    buildGraph();
    refreshHeader();
    renderCurrent();
  } catch (e) {
    toast(esc(e.message), "bad");
    renderCurrent();
  }
}

on("change", () => renderCurrent());
on("auth", () => syncAuth());
onAuthChange(() => { refreshHeader(); renderNav(state.view); });

(async function boot() {
  applyTheme();
  renderNav("overview");
  wireHeader();
  refreshHeader();
  try {
    const signed = await ensureRestored();
    await init();
    ensureDemoSuite();
    buildGraph();
    await initForms();
    if (signed) await syncAuth();
    booted = true;
    syncSelectionToHash();
    initRouter((r) => {
      state.view = r.view || "overview";
      renderCurrent();
    });
  } catch (e) {
    booted = false;
    main.innerHTML = `<div class="card pad"><div class="notice bad">⚠ Could not start: ${esc(e.message)}</div>
      <p class="muted">Check the connection to NAEB GIS (https://gis.naeb.gov.rw), then reload.</p>
      <button onclick="location.reload()">Reload</button></div>`;
  }
})();
