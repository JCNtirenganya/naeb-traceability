export const state = {
  view: "overview",
  sel: null, // {model, id}
  filters: emptyFilters(),
  q: "",
  showIndicative: true,
  colourBy: "eudr",
  mapDateField: "CreationDate",
  timeline: { from: "", to: "" },
  graphDepth: 2,
  theme: localStorage.getItem("naeb_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
};

function emptyFilters() {
  return { from: "", to: "", district: "", sector: "", risk: "", source: "", cws: "", exporter: "", importer: "" };
}
export { emptyFilters };

const subs = {};
export function on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); }
export function emit(ev, payload) { (subs[ev] || []).forEach(fn => fn(payload)); }

export function set(patch, ev = "change") {
  Object.assign(state, patch);
  if (ev !== "change") emit(ev, patch);
  emit("change", patch);
}

export function select(model, id) {
  if (model == null) state.sel = null;
  else state.sel = state.sel && state.sel.model === model && state.sel.id === id ? null : { model, id };
  emit("selection");
  emit("change", { sel: state.sel });
}

export function isSelected(model, id) { return !!state.sel && state.sel.model === model && state.sel.id === id; }

export function setFilter(k, v) { state.filters[k] = v; emit("filters"); emit("change", { filters: state.filters }); }
export function clearFilters() { state.filters = emptyFilters(); state.q = ""; emit("filters"); emit("change", {}); }

export function applyTheme() { document.documentElement.dataset.theme = state.theme; }
export function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("naeb_theme", state.theme);
  applyTheme();
}

export const RISK = { low: "#2f6b4f", review: "#c99a3a", blocked: "#a23e2c", none: "#9b958a" };
export const DS_COLOR = { live: "#2f6b4f", recorded: "#3b6ea5", indicative: "#9b958a" };
