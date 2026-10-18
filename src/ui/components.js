import { state, RISK, DS_COLOR } from "../core/store.js";
import { t } from "../core/i18n.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const N = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString());
export const fmtDate = (d) => {
  if (!d) return "—";
  const s = typeof d === "number" ? new Date(d).toISOString() : String(d);
  return s.slice(0, 10);
};
export const RISK_LABEL = { low: "Low risk", review: "Needs review", blocked: "Blocked", none: "No farm data" };

export function badge(ds) {
  const cls = ds || "indicative";
  return `<span class="badge ${cls}" title="${esc(t("ds." + cls + ".long"))}">${esc(t("ds." + cls))}</span>`;
}
export function riskPill(risk) {
  const r = risk || "none";
  return `<span class="pill" style="background:${RISK[r] || RISK.none}">${esc(RISK_LABEL[r] || r)}</span>`;
}
export function riskDot(risk) {
  return `<i class="dot" style="background:${RISK[risk] || RISK.none}"></i>`;
}
export function linkBadge(status) {
  return status === "inferred"
    ? `<span class="badge indicative" title="Linked by inference (no delivery/lot record)">${esc(t("link.inferred"))}</span>`
    : `<span class="badge live" title="Backed by a recorded delivery/lot link">${esc(t("link.confirmed"))}</span>`;
}
export function kpi(value, label, sub) {
  return `<div class="k"><b>${value}</b><span>${esc(label)}</span>${sub ? `<div class="sub muted">${sub}</div>` : ""}</div>`;
}
export function chip(model, id, label) {
  return `<span class="chip" data-t="${esc(model)}" data-id="${esc(id)}">${esc(label)}</span>`;
}
export function emptyState(msg, action) {
  return `<div class="empty"><div class="big">🗂️</div><p>${esc(msg)}</p>${action ? action : ""}</div>`;
}
export function skeleton(rows = 3) {
  return `<div class="skeletonpage">${Array.from({ length: rows }, (_, i) => `<div class="sk ${i % 2 ? "skw60" : ""}"></div>`).join("")}</div>`;
}
export function notice(msg, kind = "") {
  return `<div class="notice ${kind}">${msg}</div>`;
}

let toastTimer = null;
export function toast(msg, kind = "") {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".3s"; setTimeout(() => el.remove(), 320); }, 2600);
}

export function showDialog({ title, html, actions = [], wide = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("dlg");
    dlg.className = wide ? "wide" : "";
    const form = document.getElementById("dlgform");
    form.innerHTML = `<h3>${esc(title)}</h3><div class="dlgbody">${html}</div>
      <div class="row">${actions.map(a => `<button type="${a.type || "button"}" data-act="${a.id}" class="${a.ghost ? "ghost" : ""}">${esc(a.label)}</button>`).join("")}</div>`;
    const done = (v) => { dlg.close(); resolve(v); };
    form.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
      const a = actions.find(x => x.id === b.dataset.act);
      if (!a) return done(null);
      if (a.id === "cancel") return done(null);
      if (a.handler) { const r = a.handler(form); if (r === false) return; if (r && r.then) return r.then(v => { if (v !== false) done(v ?? true); }); return done(r ?? true); }
      done(a.id);
    });
    form.onsubmit = (e) => { e.preventDefault(); const ok = actions.find(a => a.id === "ok"); if (ok?.handler) { const r = ok.handler(form); if (r && r.then) return r.then(v => { if (v !== false) done(v ?? true); }); if (r !== false) done(r ?? true); } else done(true); };
    dlg.showModal();
  });
}
export function confirmDialog(msg, okLabel = "Confirm") {
  return showDialog({ title: "Please confirm", html: `<p>${esc(msg)}</p>`, actions: [{ id: "cancel", label: t("form.cancel"), ghost: true }, { id: "ok", label: okLabel }] });
}

export function combobox(container, { options, value = "", placeholder = "", onChange, allowEmpty = true }) {
  container.classList.add("cmb");
  container.innerHTML = `<input type="text" readonly placeholder="${esc(placeholder)}" autocomplete="off">`;
  const input = container.querySelector("input");
  let opts = [...options], filtered = opts, open = false, hi = 0;
  const labelOf = (v) => opts.find(o => o.value === v)?.label ?? "";
  input.value = labelOf(value);
  container._value = value;
  const menu = document.createElement("div");
  menu.className = "cmbmenu"; menu.hidden = true;
  container.appendChild(menu);
  const render = () => {
    if (!filtered.length) { menu.innerHTML = `<div class="none">No matches</div>`; return; }
    menu.innerHTML = filtered.slice(0, 300).map((o, i) => `<div class="opt ${i === hi ? "hi" : ""}" data-v="${esc(o.value)}">${o.color ? `<i class="dot" style="background:${o.color}"></i>` : ""}<span>${esc(o.label)}</span>${o.sub ? `<small class="muted" style="margin-left:auto">${esc(o.sub)}</small>` : ""}</div>`).join("");
  };
  const openMenu = () => { open = true; menu.hidden = false; filtered = opts; hi = 0; render(); };
  const close = () => { open = false; menu.hidden = true; };
  const setVal = (v) => { input.value = labelOf(v); container._value = v; onChange && onChange(v); };
  input.onfocus = () => { input.readOnly = false; openMenu(); input.select(); };
  input.oninput = () => { const q = input.value.toLowerCase(); filtered = opts.filter(o => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)); hi = 0; if (!open) openMenu(); render(); };
  input.onblur = () => setTimeout(() => { close(); input.readOnly = true; input.value = labelOf(value); }, 160);
  input.onkeydown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { hi = Math.min(hi + 1, filtered.length - 1); render(); e.preventDefault(); }
    if (e.key === "ArrowUp") { hi = Math.max(hi - 1, 0); render(); e.preventDefault(); }
    if (e.key === "Enter") { const o = filtered[hi]; if (o) { value = o.value; setVal(o.value); } close(); e.preventDefault(); }
    if (e.key === "Escape") { close(); input.value = labelOf(value); }
  };
  menu.onmousedown = (e) => { const o = e.target.closest("[data-v]"); if (o) { value = o.dataset.v; setVal(o.dataset.v); } close(); };
  if (allowEmpty) {
    opts = [{ value: "", label: placeholder || "—" }, ...opts];
    if (!value) input.value = labelOf("");
  }
  container._setOptions = (next) => { opts = allowEmpty ? [{ value: "", label: placeholder || "—" }, ...next] : next; if (open) { filtered = opts; render(); } };
  return { get value() { return value; }, set(v) { value = v; input.value = labelOf(v); } };
}

export function dataSourceLegend() {
  return `<span class="badge live">${esc(t("ds.live"))}</span> <span class="badge recorded">${esc(t("ds.recorded"))}</span> <span class="badge indicative">${esc(t("ds.indicative"))}</span>`;
}
