import { state } from "../../core/store.js";
import { token, can } from "../../core/auth.js";
import R, { getModel, get, titleOf } from "../../data/registry.js";
import { buildForm, wireForm, collectForm, validateForm } from "../formgen.js";
import { esc, toast, emptyState, notice, badge } from "../components.js";

export function renderRecord(container, params) {
  const modelId = params.rest[0];
  const id = params.rest[1];
  const model = getModel(modelId);
  if (!model) { container.innerHTML = emptyState("Unknown model."); return; }
  if (!can("edit")) { container.innerHTML = emptyState("Your role is read-only. Ask an administrator for editor access."); return; }
  if (!token()) { container.innerHTML = emptyState("Sign in to record data."); return; }
  const editing = id ? get(modelId, id) : null;
  if (editing) model._editingId = id;

  const demoNote = model.url ? "" : notice(`<b>${esc(model.name)}</b> is not yet published to the portal, so this record is kept for this session only and tagged <span class="badge recorded">recorded</span>. An admin can publish the model in <a href="#/admin">Admin</a> to store rows in ArcGIS.`, "");

  container.innerHTML = `<div class="card pad" style="max-width:980px;margin:0 auto">
    <div class="row"><small class="muted">${esc(model.icon)} ${esc(model.name.toUpperCase())}</small>${badge(model.url ? "recorded" : "indicative")}</div>
    <h2 style="margin-top:6px">${editing ? "Edit " : "New "}${esc(model.name)}${editing ? ": " + esc(titleOf(model, editing)) : ""}</h2>
    ${demoNote}
    ${model.storage === "point" ? `<div class="notice">Location: click the mini-map to set the point (optional).</div><div class="gpsbox" id="gpsbox"></div>` : ""}
    <div id="formhost">${buildForm(model, editing)}</div>
    <div id="formerr"></div>
    <div class="row rowend" style="margin-top:14px">
      <button class="ghost" id="cancel">${esc("Cancel")}</button>
      <button id="save">${esc(editing ? "Save changes" : "Save record")}</button>
    </div>
  </div>`;

  wireForm(document.getElementById("formhost"), model, editing);
  let geometry = null;
  if (model.storage === "point" && window.L) {
    const map = L.map("gpsbox").setView([-1.95, 29.9], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    let marker = null;
    if (editing?.lng) marker = L.marker([editing.lat, editing.lng]).addTo(map);
    map.on("click", e => {
      geometry = { x: e.latlng.lng, y: e.latlng.lat, spatialReference: { wkid: 4326 } };
      if (!marker) marker = L.marker(e.latlng).addTo(map); else marker.setLatLng(e.latlng);
    });
    setTimeout(() => map.invalidateSize(), 80);
  }

  document.getElementById("cancel").onclick = () => history.back();
  document.getElementById("save").onclick = async () => {
    const { values } = collectForm(document.getElementById("formhost"));
    const errors = validateForm(model, values, document.getElementById("formhost"));
    if (errors.length) { toast(errors.length + " field(s) need attention", "bad"); return; }
    const btn = document.getElementById("save"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      const { create, update } = await import("../../data/registry.js");
      if (editing) { await update(modelId, editing.id, values, geometry); toast("Saved", "ok"); }
      else { const r = await create(modelId, values, geometry); toast("Record created", "ok"); if (r) { location.hash = `#/view/${modelId}/${encodeURIComponent(r.id)}`; return; } }
      if (R.__registryRefresh) R.__registryRefresh();
      location.hash = `#/view/${modelId}/${encodeURIComponent((editing || {}).id || "")}`;
    } catch (e) {
      document.getElementById("formerr").innerHTML = notice(esc(e.message), "bad");
      toast(esc(e.message), "bad");
    } finally { btn.disabled = false; btn.textContent = editing ? "Save changes" : "Save record"; }
  };
}
