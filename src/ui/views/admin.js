import { state } from "../../core/store.js";
import { token, role, user } from "../../core/auth.js";
import R, { models, getModel, upsertModel, saveRegistry, publishModel, dataStatus, recordsOf } from "../../data/registry.js";
import { esc, N, badge, emptyState, toast, notice, showDialog } from "../components.js";
import { allForms, initForms, upsertForm, deleteForm, newForm, newQuestion, saveForms, getForm } from "../../data/forms.js";
import { downloadXlsForm } from "../../admin/xlsform.js";

const FIELD_TYPES = ["string", "text", "integer", "decimal", "date", "datetime", "boolean", "choice", "multichoice", "lookup", "file"];
const Q_TYPES = ["short text", "paragraph", "integer", "decimal", "date", "time", "datetime", "single choice", "multiple choice", "dropdown", "yes/no", "rating", "scale", "ranking", "gps point", "draw line", "draw polygon", "photo", "file", "signature", "barcode", "lookup", "calculation", "hidden", "note", "instruction"];

export function renderAdmin(container, params) {
  if (role() !== "admin") { container.innerHTML = emptyState("Admin only. Your portal role does not allow building models or forms."); return; }
  const tab = params.params.tab || "models";
  container.innerHTML = `
    <div class="tabs" id="atabs">
      <button data-tab="models" class="${tab === "models" ? "on" : ""}">Models</button>
      <button data-tab="forms" class="${tab === "forms" ? "on" : ""}">Forms</button>
      <button data-tab="status" class="${tab === "status" ? "on" : ""}">Data status</button>
      <button data-tab="portal" class="${tab === "portal" ? "on" : ""}">Portal &amp; auth</button>
    </div>
    <div id="apanel"></div>`;
  container.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { location.hash = "#/admin?tab=" + b.dataset.tab; });
  const panel = document.getElementById("apanel");
  if (tab === "models") renderModels(panel);
  else if (tab === "forms") renderForms(panel);
  else if (tab === "status") renderStatus(panel);
  else renderPortal(panel);
}

function renderPortal(panel) {
  panel.innerHTML = `<div class="card pad">
    <h2>Portal connection</h2>
    <dl><dt>Portal</dt><dd>${esc("https://gis.naeb.gov.rw/portal")}</dd>
    <dt>Folder</dt><dd>Trace (in your My Content)</dd>
    <dt>Signed in</dt><dd>${user() ? esc(user().fullName || user().username) + " · " + esc(role()) : "not signed in"}</dd>
    <dt>Model registry item</dt><dd>${R.registryItemId ? esc(R.registryItemId) : "not created yet — Save models to create it"}</dd></dl>
    <p class="mini">New tables are created with your portal token via createService + addToDefinition. If your account cannot create services, ask the GIS admin to run <code>scripts/create_tables.py</code>, then paste each layer URL into the model's URL field.</p>
  </div>`;
}

function renderStatus(panel) {
  panel.innerHTML = `<div class="card pad"><h2>Data status by model</h2>
    <div class="tablewrap"><table><thead><tr><th>Model</th><th>Source</th><th>Records</th><th>Storage</th><th>Note</th></tr></thead><tbody>
    ${dataStatus().map(s => `<tr><td>${esc(s.model.icon)} ${esc(s.model.plural)}</td><td>${badge(s.source)}</td><td>${N(s.count)}</td>
      <td class="mini">${esc(s.model.kind)}${s.model.url ? `<br>${esc(s.model.url)}` : ""}</td><td class="mini">${esc(s.note)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}

/* ---------- Model builder ---------- */

function renderModels(panel) {
  const editable = models();
  panel.innerHTML = `
    <div class="toolbar">
      <button id="mnew">+ New model</button>
      <button id="msave" class="ghost">Save registry to portal</button>
      <button id="mexport" class="ghost">Export JSON (for Python script)</button>
      <span class="spacer"></span>
      <span class="mini">Publish creates the hosted table in the <b>Trace</b> folder; re-running only adds missing fields.</span>
    </div>
    <div id="mlist"></div>`;
  document.getElementById("mnew").onclick = () => openModelEditor(null);
  document.getElementById("mexport").onclick = () => {
    const payload = JSON.stringify({ version: 1, models: models().filter(m => m.kind === "recordable") }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    a.download = "models-export.json"; a.click();
  };
  document.getElementById("msave").onclick = async () => {
    try { await saveRegistry(); toast("Registry saved to the portal", "ok"); }
    catch (e) { toast(esc(e.message), "bad"); }
  };
  const list = document.getElementById("mlist");
  list.innerHTML = editable.map(m => `
    <div class="card pad" style="margin-bottom:10px">
      <div class="row">
        <b>${esc(m.icon)} ${esc(m.plural)}</b>${badge(m.kind === "system-live" ? "live" : m.url ? "recorded" : "indicative")}
        <span class="spacer"></span>
        <button class="ghost sm" data-edit="${m.id}">Edit</button>
        ${m.kind === "recordable" ? `<button class="sm" data-pub="${m.id}">${m.url ? "Publish (add fields)" : "Publish to portal"}</button>` : ""}
      </div>
      <div class="mini" style="margin-top:6px">${esc(m.fields.length)} field(s) · storage: ${esc(m.storage)}
        ${m.searchable ? " · searchable" : ""}${m.onMap ? " · on map" : ""}${m.inGraph ? " · in graph" : ""}
        ${m.url ? `<br>URL: ${esc(m.url)}` : ""}</div>
    </div>`).join("");
  list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openModelEditor(getModel(b.dataset.edit)));
  list.querySelectorAll("[data-pub]").forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = "Publishing…";
    try { const url = await publishModel(b.dataset.pub); toast("Published: " + esc(url), "ok"); renderModels(panel); }
    catch (e) { toast(esc(e.message), "bad"); b.disabled = false; b.textContent = "Publish to portal"; }
  });
}

function openModelEditor(m0) {
  const m = m0 ? JSON.parse(JSON.stringify(m0)) : {
    id: "m" + Math.random().toString(36).slice(2, 7), name: "New model", plural: "New models", icon: "📌",
    color: "#7a5c3e", kind: "recordable", storage: "table", url: "", titleField: "name",
    attachments: false, editorTracking: true, softDelete: "is_active", searchable: true, onMap: false, inGraph: true,
    fields: [{ name: "name", label: "Name", type: "string", required: true, showInList: true }],
    listColumns: ["name"], profileFields: ["name"], custom: true
  };
  const isSystem = m.kind === "system-live";
  showDialog({
    title: (m0 ? "Edit" : "New") + " model", wide: true,
    html: `<div class="fieldgrid">
      <label>Name<input id="me_name" value="${esc(m.name)}" ${isSystem ? "disabled" : ""}></label>
      <label>Plural<input id="me_plural" value="${esc(m.plural)}" ${isSystem ? "disabled" : ""}></label>
      <label>Icon (emoji)<input id="me_icon" value="${esc(m.icon)}"></label>
      <label>Title field<input id="me_title" value="${esc(m.titleField)}"></label>
      <label>Storage<select id="me_storage" ${isSystem ? "disabled" : ""}>
        ${["table", "point", "line", "polygon"].map(s => `<option value="${s}" ${m.storage === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        <div class="help">Geometry type cannot change after the table is created in ArcGIS.</div></label>
      <label>Existing layer URL (optional)<input id="me_url" value="${esc(m.url || "")}" placeholder="https://gis.naeb.gov.rw/server/rest/services/Trace/.../FeatureServer/0"></label>
    </div>
    <div class="row">
      <label class="checkline"><input type="checkbox" id="me_search" ${m.searchable ? "checked" : ""}> Searchable</label>
      <label class="checkline"><input type="checkbox" id="me_map" ${m.onMap ? "checked" : ""}> Show on map</label>
      <label class="checkline"><input type="checkbox" id="me_graph" ${m.inGraph ? "checked" : ""}> Show in graph</label>
      <label class="checkline"><input type="checkbox" id="me_att" ${m.attachments ? "checked" : ""}> Attachments</label>
    </div>
    <hr class="sep"><div class="row"><b>Fields</b><span class="spacer"></span><button type="button" class="ghost sm" id="me_addf">+ Add field</button></div>
    <div id="me_fields"></div>`,
    actions: [{ id: "cancel", label: "Cancel", ghost: true }, { id: "ok", label: "Save model", handler: () => {
      m.name = document.getElementById("me_name").value.trim() || m.name;
      m.plural = document.getElementById("me_plural").value.trim() || m.plural;
      m.icon = document.getElementById("me_icon").value.trim() || m.icon;
      m.titleField = document.getElementById("me_title").value.trim() || m.titleField;
      if (!isSystem) m.storage = document.getElementById("me_storage").value;
      m.url = document.getElementById("me_url").value.trim();
      m.searchable = document.getElementById("me_search").checked;
      m.onMap = document.getElementById("me_map").checked;
      m.inGraph = document.getElementById("me_graph").checked;
      m.attachments = document.getElementById("me_att").checked;
      m.fields = collectFields(document.getElementById("me_fields"));
      m.listColumns = m.fields.filter(f => f.showInList || f.name === m.titleField).map(f => f.name).slice(0, 6);
      m.profileFields = m.fields.map(f => f.name);
      upsertModel(m);
      toast("Model saved" + (m.url ? "" : " (demo until published)"), "ok");
      location.hash = "#/admin?tab=models";
      return true;
    } }]
  });
  const host = document.getElementById("me_fields");
  renderFieldRows(host, m.fields);
  document.getElementById("me_addf").onclick = () => { renderFieldRows(host, [...collectFields(host), { name: "field_" + host.children.length, label: "New field", type: "string", required: false, showInList: false }]); };
}

function renderFieldRows(host, fields) {
  host.innerHTML = fields.map((f, i) => `
    <div class="qrow" data-i="${i}">
      <span class="handle">⠿</span>
      <input class="ff_name" value="${esc(f.name)}" placeholder="field_name">
      <input class="ff_label" value="${esc(f.label)}" placeholder="Label">
      <select class="ff_type">${FIELD_TYPES.map(t => `<option value="${t}" ${f.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <button type="button" class="ghost" data-del="${i}">✕</button>
      <div class="qsub">
        <label class="checkline"><input type="checkbox" class="ff_req" ${f.required ? "checked" : ""}> Required</label>
        <label class="checkline"><input type="checkbox" class="ff_uniq" ${f.unique ? "checked" : ""}> Unique</label>
        <label class="checkline"><input type="checkbox" class="ff_list" ${f.showInList ? "checked" : ""}> Show in list</label>
        <input class="ff_choices" value="${esc((f.choices || []).map(c => c.value).join(","))}" placeholder="choices (comma-sep)">
        <input class="ff_help" value="${esc(f.help || "")}" placeholder="help text">
        <input class="ff_lookup" value="${esc(f.model || "")}" placeholder="lookup target model (for type=lookup)">
      </div>
    </div>`).join("");
  host.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    const cur = collectFields(host); cur.splice(+b.dataset.del, 1); renderFieldRows(host, cur);
  });
}

function collectFields(host) {
  return [...host.querySelectorAll(".qrow")].map(row => {
    const type = row.querySelector(".ff_type").value;
    const choices = row.querySelector(".ff_choices").value.split(",").map(s => s.trim()).filter(Boolean).map(v => ({ value: v, label: v }));
    return {
      name: row.querySelector(".ff_name").value.trim(),
      label: row.querySelector(".ff_label").value.trim(),
      type,
      required: row.querySelector(".ff_req").checked,
      unique: row.querySelector(".ff_uniq").checked,
      showInList: row.querySelector(".ff_list").checked,
      choices: (type === "choice" || type === "multichoice") ? choices : undefined,
      help: row.querySelector(".ff_help").value.trim() || undefined,
      model: type === "lookup" ? row.querySelector(".ff_lookup").value.trim() : undefined
    };
  }).filter(f => f.name);
}

/* ---------- Form builder ---------- */

function renderForms(panel) {
  initForms().then(() => {
    panel.innerHTML = `
      <div class="toolbar">
        <button id="fnew">+ New survey form</button>
        <span class="spacer"></span>
        <span class="mini">Forms are saved as a portal item; a signed-in user can fill them. Export to XLSForm for Survey123.</span>
      </div>
      <div id="flist"></div>`;
    document.getElementById("fnew").onclick = () => { const f = newForm(); upsertForm(f); location.hash = "#/admin?tab=forms&form=" + f.id; };
    const list = document.getElementById("flist");
    const formsList = allForms();
    const editing = new URLSearchParams(location.hash.split("?")[1] || "").get("form");
    if (editing) { renderFormEditor(list, getForm(editing)); return; }
    list.innerHTML = formsList.length ? formsList.map(f => `
      <div class="card pad" style="margin-bottom:10px"><div class="row">
        <b>${esc(f.icon || "📝")} ${esc(f.title)}</b>${f.targetModel ? `<span class="chip">→ ${esc(f.targetModel)}</span>` : ""}
        <span class="spacer"></span>
        <button class="ghost sm" data-fill="${f.id}">Fill</button>
        <button class="ghost sm" data-edit="${f.id}">Edit</button>
        <button class="ghost sm" data-xls="${f.id}">Export XLSForm</button>
        <button class="ghost sm" data-del="${f.id}">Delete</button>
      </div>
      <div class="mini" style="margin-top:6px">${esc((f.sections || []).reduce((t, s) => t + s.questions.length, 0))} question(s)</div></div>`).join("")
      : emptyState("No forms yet.");
    list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => renderFormEditor(list, getForm(b.dataset.edit)));
    list.querySelectorAll("[data-fill]").forEach(b => b.onclick = () => { location.hash = "#/forms/fill/" + b.dataset.fill; });
    list.querySelectorAll("[data-xls]").forEach(b => b.onclick = () => downloadXlsForm(getForm(b.dataset.xls)));
    list.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      deleteForm(b.dataset.del); await saveForms(); renderForms(panel);
    });
  });
}

function renderFormEditor(host, form) {
  host.innerHTML = `
    <div class="card pad">
      <div class="fieldgrid">
        <label>Form title<input id="fb_title" value="${esc(form.title)}"></label>
        <label>Target model (optional)<input id="fb_target" value="${esc(form.targetModel || "")}" placeholder="delivery / lot / custom id"></label>
      </div>
      <div id="fb_sections"></div>
      <div class="row"><button type="button" class="ghost sm" id="fb_addsec">+ Add section</button>
        <span class="spacer"></span>
        <button class="ghost" id="fb_back">Back</button>
        <button id="fb_save">Save form</button></div>
    </div>`;
  const secHost = document.getElementById("fb_sections");
  const renderSections = () => {
    secHost.innerHTML = form.sections.map((s, si) => `
      <div class="formsec" data-si="${si}">
        <div class="row"><input class="fb_stitle" value="${esc(s.title)}" style="max-width:320px"><span class="spacer"></span>
          <button type="button" class="ghost sm" data-addq="${si}">+ question</button>
          <button type="button" class="ghost sm" data-delsec="${si}">Delete section</button></div>
        ${s.questions.map((q, qi) => questionRow(si, qi, q)).join("") || `<div class="mini">No questions yet.</div>`}
      </div>`).join("");
    secHost.querySelectorAll("[data-addq]").forEach(b => b.onclick = () => { form.sections[+b.dataset.addq].questions.push(newQuestion()); renderSections(); });
    secHost.querySelectorAll("[data-delsec]").forEach(b => b.onclick = () => { form.sections.splice(+b.dataset.delsec, 1); if (!form.sections.length) form.sections.push({ title: "Section 1", questions: [] }); renderSections(); });
    secHost.querySelectorAll(".qrow").forEach(row => {
      row.querySelector(".fb_del").onclick = () => { form.sections[+row.dataset.si].questions.splice(+row.dataset.qi, 1); renderSections(); };
      const t = row.querySelector(".fb_type");
      t.onchange = () => { form.sections[+row.dataset.si].questions[+row.dataset.qi].type = t.value; renderSections(); };
    });
    secHost.querySelectorAll(".fb_choices").forEach(inp => inp.onchange = () => {
      const q = form.sections[+inp.dataset.si].questions[+inp.dataset.qi];
      q.choices = inp.value.split(",").map(s => s.trim()).filter(Boolean).map(v => ({ value: v, label: v, label_en: v }));
    });
  };
  renderSections();
  document.getElementById("fb_addsec").onclick = () => { form.sections.push({ title: "Section " + (form.sections.length + 1), questions: [] }); renderSections(); };
  document.getElementById("fb_back").onclick = () => { location.hash = "#/admin?tab=forms"; };
  document.getElementById("fb_save").onclick = async () => {
    form.title = document.getElementById("fb_title").value.trim() || form.title;
    form.targetModel = document.getElementById("fb_target").value.trim();
    form.sections.forEach(s => { s._el = undefined; });
    host.querySelectorAll(".fb_stitle").forEach((inp, i) => { if (form.sections[i]) form.sections[i].title = inp.value; });
    // pull question fields
    const rows = [...host.querySelectorAll(".qrow")];
    for (const row of rows) {
      const si = +row.dataset.si, qi = +row.dataset.qi;
      const q = form.sections[si].questions[qi];
      q.label_en = row.querySelector(".fb_label").value.trim();
      q.name = row.querySelector(".fb_name").value.trim() || q.name;
      q.required = row.querySelector(".fb_req").checked;
      q.relevant = row.querySelector(".fb_rel").value.trim();
      q.calculation = row.querySelector(".fb_calc").value.trim();
      q.lookup = row.querySelector(".fb_lookup").value.trim();
      const ch = row.querySelector(".fb_choices");
      if (ch) q.choices = ch.value.split(",").map(s => s.trim()).filter(Boolean).map(v => ({ value: v, label: v, label_en: v }));
    }
    upsertForm(form);
    try { const id = await saveForms(); toast("Form saved" + (id ? " to the portal" : " locally"), "ok"); }
    catch (e) { toast(esc(e.message), "bad"); }
    location.hash = "#/admin?tab=forms";
  };
}

function questionRow(si, qi, q) {
  const hasChoices = ["single choice", "multiple choice", "dropdown", "ranking"].includes(q.type);
  return `<div class="qrow" data-si="${si}" data-qi="${qi}">
    <span class="handle">⠿</span>
    <input class="fb_label" value="${esc(q.label_en || "")}" placeholder="Question label">
    <select class="fb_type">${Q_TYPES.map(t => `<option value="${t}" ${q.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
    <input class="fb_name" value="${esc(q.name || "")}" placeholder="field_name">
    <button type="button" class="ghost fb_del">✕</button>
    <div class="qsub">
      <label class="checkline"><input type="checkbox" class="fb_req" ${q.required ? "checked" : ""}> Required</label>
      <input class="fb_rel" value="${esc(q.relevant || "")}" placeholder="skip logic: ${'${q1} = A'}">
      <input class="fb_calc" value="${esc(q.calculation || "")}" placeholder="calculation (e.g. ${'${q4} * 2'})">
      <input class="fb_lookup" value="${esc(q.lookup || "")}" placeholder="lookup model (cws/farmer/...)">
      ${hasChoices ? `<input class="fb_choices" data-si="${si}" data-qi="${qi}" value="${esc((q.choices || []).map(c => c.value).join(","))}" placeholder="choices comma-separated" style="grid-column:1/-1">` : ""}
    </div>
  </div>`;
}
