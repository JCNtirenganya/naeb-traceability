import { state, set, emit, applyTheme, toggleTheme } from "../core/store.js";
import { t, getLang, setLang } from "../core/i18n.js";
import { token, user, role, logout } from "../core/auth.js";
import { searchAll, getModel, titleOf } from "../data/registry.js";
import { toast, esc, badge } from "./components.js";

export const NAV = [
  ["overview", "nav.overview", "◱"], ["map", "nav.map", "🗺"], ["network", "nav.network", "🕸"],
  ["registry", "nav.registry", "📋"], ["batches", "nav.batches", "🗳"], ["forms", "nav.forms", "📝"],
  ["reports", "nav.reports", "📄"], ["admin", "nav.admin", "⚙"]
];

export function renderNav(active) {
  const admin = ["admin"];
  const el = document.getElementById("nav");
  el.innerHTML = NAV.filter(([k]) => !admin.includes(k) || role() === "admin").map(([k, label, icon]) =>
    `<button data-nav="${k}" class="${active === k ? "on" : ""}">${icon} ${esc(t(label))}</button>`).join("");
  el.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { location.hash = "#/" + b.dataset.nav; });
}

export function refreshHeader() {
  const signed = !!token();
  document.getElementById("signinbtn").hidden = signed;
  document.getElementById("signoutbtn").hidden = !signed;
  const u = user();
  document.getElementById("srcline").innerHTML = signed
    ? `${badge("live")} signed in as <b>${esc(u?.fullName || u?.username || "user")}</b> · role ${esc(role())}`
    : `Sign in to load farms and record data · stations are public`;
  document.getElementById("indictoggle").classList.toggle("on", state.showIndicative && signed);
  if (!signed) state.showIndicative = true;
  document.getElementById("langbtn").textContent = getLang().toUpperCase();
  document.getElementById("themebtn").textContent = state.theme === "dark" ? "☀" : "◐";
}

let paletteItems = [];
export function openPalette(prefill = "") {
  const host = document.getElementById("palette");
  host.hidden = false;
  const q = document.getElementById("pq");
  q.value = prefill;
  q.focus();
  const renderResults = () => {
    const val = q.value.toLowerCase().trim();
    const actions = [
      { model: "_act", id: "map", title: "Open Map", sub: "View polygons", icon: "🗺" },
      { model: "_act", id: "network", title: "Open Network graph", sub: "Trace chains", icon: "🕸" },
      { model: "_act", id: "reports", title: "Open Reports", sub: "Print / CSV scope", icon: "📄" },
      { model: "_act", id: "admin", title: "Open Admin", sub: "Models & forms", icon: "⚙", admin: true }
    ].filter(a => !a.admin || role() === "admin");
    const act = actions.filter(a => !val || a.title.toLowerCase().includes(val));
    const res = val ? searchAll(val, 30) : [];
    const groups = {};
    for (const r of res) (groups[r.modelId] = groups[r.modelId] || []).push(r);
    let html = "";
    if (act.length) html += `<div class="pgroup">Actions</div>` + act.map(a => `<div class="pitem" data-act="${a.id}">${a.icon} <div>${esc(a.title)}<br><small>${esc(a.sub)}</small></div></div>`).join("");
    for (const [mid, rows] of Object.entries(groups)) {
      const m = getModel(mid);
      html += `<div class="pgroup">${esc(m?.plural || mid)}</div>` + rows.map(r =>
        `<div class="pitem" data-t="${mid}" data-id="${esc(r.id)}"><span>${esc(m?.icon || "•")}</span><div>${esc(r.title)}<br><small>${esc(r.sub || "")}</small></div></div>`).join("");
    }
    if (!html) html = `<div class="pgroup">No matches for “${esc(q.value)}”</div>`;
    document.getElementById("pres").innerHTML = html;
    document.getElementById("pres").querySelectorAll(".pitem").forEach(el => el.onclick = () => {
      closePalette();
      if (el.dataset.act) location.hash = "#/" + el.dataset.act;
      else if (window.__naeb_select) window.__naeb_select(el.dataset.t, el.dataset.id);
    });
  };
  q.oninput = renderResults;
  renderResults();
  q.onkeydown = e => {
    if (e.key === "Escape") closePalette();
    if (e.key === "Enter") { const first = document.querySelector("#pres .pitem"); if (first) first.click(); }
  };
}
export function closePalette() { document.getElementById("palette").hidden = true; }

export function wireHeader() {
  document.getElementById("signinbtn").onclick = openSignIn;
  document.getElementById("gsearch").onfocus = () => openPalette();
  document.getElementById("gsearch").onkeydown = e => { if (e.key === "Enter") openPalette(e.target.value); };
  document.getElementById("palette").onclick = e => { if (e.target.id === "palette") closePalette(); };
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
    if (e.key === "Escape") closePalette();
  });
  document.getElementById("themebtn").onclick = () => { toggleTheme(); refreshHeader(); emit("change", {}); };
  document.getElementById("langbtn").onclick = () => {
    const order = ["en", "fr", "rw"];
    const next = order[(order.indexOf(getLang()) + 1) % 3];
    setLang(next);
    toast("Language: " + next.toUpperCase());
    refreshHeader(); renderNav(state.view); emit("change", {});
  };
  document.getElementById("indictoggle").onclick = () => {
    set({ showIndicative: !state.showIndicative });
    refreshHeader();
    toast(state.showIndicative ? "Showing indicative data" : "Hiding indicative data");
  };
  document.getElementById("signoutbtn").onclick = () => {
    logout();
    toast("Signed out");
    location.hash = "#/overview";
    emit("auth");
  };
  document.getElementById("signinform").onsubmit = async e => {
    e.preventDefault();
    const u = document.getElementById("su"), p = document.getElementById("sp"), msg = document.getElementById("smsg"), btn = document.getElementById("sgo");
    btn.disabled = true; msg.textContent = "Signing in…";
    try {
      const { login } = await import("./core/auth.js");
      await login(u.value.trim(), p.value);
      p.value = ""; document.getElementById("signindlg").close();
      toast("Signed in as " + (user()?.fullName || u.value), "ok");
      emit("auth");
      emit("change", {});
    } catch (err) { msg.textContent = err.message; }
    btn.disabled = false;
  };
  document.getElementById("scancel").onclick = () => document.getElementById("signindlg").close();
}

export function openSignIn() {
  document.getElementById("smsg").textContent = "";
  document.getElementById("signindlg").showModal();
}

applyTheme();
