import { state, emit } from "./store.js";

let current = { view: "overview", params: {} };

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  const segs = path.split("/").filter(Boolean);
  const view = segs[0] || "overview";
  const rest = segs.slice(1);
  return { view, rest, params };
}

export function currentRoute() { return current; }

export function go(view, params = {}, rest = []) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null) q.set(k, v);
  const qs = q.toString();
  location.hash = "#/" + view + (rest.length ? "/" + rest.join("/") : "") + (qs ? "?" + qs : "");
}

export function syncSelectionToHash() {
  const p = new URLSearchParams(location.hash.split("?")[1] || "");
  if (state.sel) p.set("sel", state.sel.model + ":" + state.sel.id);
  else p.delete("sel");
  for (const [k, v] of Object.entries(state.filters)) if (v) p.set(k, v); else p.delete(k);
  if (state.q) p.set("q", state.q); else p.delete("q");
  if (!state.showIndicative) p.set("noind", "1"); else p.delete("noind");
  const base = "#/" + (current.view || "overview") + (current.rest?.length ? "/" + current.rest.join("/") : "");
  const qs = p.toString();
  history.replaceState(null, "", base + (qs ? "?" + qs : ""));
}

export function readSelectionFromHash(params) {
  if (params.sel) {
    const i = params.sel.indexOf(":");
    if (i > 0) state.sel = { model: params.sel.slice(0, i), id: params.sel.slice(i + 1) };
  }
  for (const k of Object.keys(state.filters)) if (params[k]) state.filters[k] = params[k];
  if (params.q) state.q = params.q;
  if (params.noind) state.showIndicative = false;
}

export function initRouter(routeFn) {
  const handle = () => {
    const r = parseHash();
    current = r;
    state.view = r.view;
    readSelectionFromHash(r.params);
    emit("route", r);
    routeFn(r);
  };
  window.addEventListener("hashchange", handle);
  handle();
}
