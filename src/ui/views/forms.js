import { state } from "../../core/store.js";
import { token, can } from "../../core/auth.js";
import { allForms, initForms, getForm } from "../../data/forms.js";
import { recordsOf, getModel, titleOf, get } from "../../data/registry.js";
import { esc, toast, emptyState, notice, combobox, badge } from "../components.js";

export function renderForms(container, params) {
  const fillId = params.rest && params.rest[0] === "fill" ? params.rest[1] : null;
  if (fillId) { renderFill(container, fillId); return; }
  initForms().then(() => {
    const forms = allForms();
    container.innerHTML = `<div class="toolbar"><b>Data-collection forms</b><span class="spacer"></span>
      ${can("admin") ? `<a href="#/admin?tab=forms"><button class="ghost sm">Manage forms</button></a>` : ""}</div>
      ${!token() ? notice("Sign in to submit data-collection forms. Everything submitted is stored in the NAEB portal.") : ""}
      ${forms.length ? forms.map(f => `<div class="card pad" style="margin-bottom:10px"><div class="row">
        <b>${esc(f.icon || "📝")} ${esc(f.title)}</b>${f.targetModel ? `<span class="chip">→ ${esc(f.targetModel)}</span>` : ""}
        <span class="spacer"></span>
        <button class="sm" data-fill="${f.id}" ${token() ? "" : "disabled"}>Open form</button></div>
        <div class="mini" style="margin-top:6px">${esc((f.sections || []).reduce((t, s) => t + s.questions.length, 0))} question(s)</div></div>`).join("")
      : emptyState("No forms yet. An admin can build one in Admin → Forms.")}`;
    container.querySelectorAll("[data-fill]").forEach(b => b.onclick = () => { location.hash = "#/forms/fill/" + b.dataset.fill; });
  });
}

function renderFill(container, formId) {
  initForms().then(() => {
    const form = getForm(formId);
    if (!form) { container.innerHTML = emptyState("Form not found."); return; }
    if (!token()) { container.innerHTML = emptyState("Sign in to open this form."); return; }
    container.innerHTML = `<div class="card pad" style="max-width:860px;margin:0 auto">
      <small class="muted">📝 SURVEY FORM${form.targetModel ? " → " + esc(form.targetModel) : ""}</small>
      <h2>${esc(form.title)}</h2>
      <div id="fillhost"></div>
      <div id="fillerr"></div>
      <div class="row rowend" style="margin-top:14px"><button class="ghost" id="fbcancel">Cancel</button><button id="fbsubmit">Submit</button></div>
    </div>`;
    const host = document.getElementById("fillhost");
    const values = {};
    host.innerHTML = form.sections.map((s, si) => `<div class="formsec" data-si="${si}"><h4>${esc(s.title)}</h4>
      ${s.questions.map((q, qi) => qHtml(si, qi, q)).join("")}</div>`).join("");

    const evaluate = () => {
      host.querySelectorAll(".formfield").forEach(el => {
        const name = el.dataset.qname;
        const q = findQ(form, name);
        if (q.relevant) {
          try {
            const expr = q.relevant.replace(/\$\{([^}]+)\}/g, '(V["$1"]||"")');
            const ok = new Function("V", "return (" + expr + ");")(values);
            el.style.display = ok ? "" : "none";
          } catch { el.style.display = ""; }
        }
        if (q.calculation) {
          try {
            const expr = q.calculation.replace(/\$\{([^}]+)\}/g, '(V["$1"]||0)');
            const v = new Function("V", "return (" + expr + ");")(values);
            const inp = el.querySelector("input,textarea,select");
            if (inp && v != null) { inp.value = v; values[name] = v; }
          } catch { /* ignore */ }
        }
      });
    };

    host.querySelectorAll("[data-qname] input, [data-qname] textarea, [data-qname] select").forEach(inp => {
      inp.addEventListener("input", () => {
        const wrap = inp.closest("[data-qname]");
        const q = findQ(form, wrap.dataset.qname);
        if (q.type === "multiple choice" || q.type === "ranking") {
          values[q.name] = [...wrap.querySelectorAll("input:checked")].map(i => i.value).join(",");
        } else if (inp.type === "checkbox") values[q.name] = inp.checked;
        else values[q.name] = inp.value;
        evaluate();
      });
    });
    host.querySelectorAll("[data-lookup]").forEach(async el => {
      const mid = el.dataset.model;
      const opts = recordsOf(mid).map(r => ({ value: r.id, label: titleOf(getModel(mid), r) }));
      combobox(el, { options: opts, placeholder: "Select " + (getModel(mid)?.name || mid), onChange: v => { values[el.dataset.lookup] = v; evaluate(); } });
    });
    evaluate();

    document.getElementById("fbcancel").onclick = () => { location.hash = "#/forms"; };
    document.getElementById("fbsubmit").onclick = async () => {
      const errs = [];
      for (const s of form.sections) for (const q of s.questions) {
        if (q.required && !["note", "instruction"].includes(q.type)) {
          const v = values[q.name];
          if (v == null || v === "") errs.push(q.label_en || q.name);
        }
      }
      if (errs.length) { document.getElementById("fillerr").innerHTML = notice("Please complete: " + esc(errs.join(", ")), "bad"); return; }
      const btn = document.getElementById("fbsubmit"); btn.disabled = true; btn.textContent = "Submitting…";
      try {
        const modelId = form.targetModel || ("form_" + form.formId);
        const { create } = await import("../../data/registry.js");
        const attrs = {};
        for (const s of form.sections) for (const q of s.questions) if (q.name && values[q.name] !== undefined && q.type !== "note") attrs[q.name] = values[q.name];
        const rec = await create(modelId, attrs);
        toast("Submission saved", "ok");
        location.hash = modelId && getModel(modelId) ? `#/view/${modelId}/${encodeURIComponent(rec.id)}` : "#/forms";
      } catch (e) { document.getElementById("fillerr").innerHTML = notice(esc(e.message), "bad"); toast(esc(e.message), "bad"); }
      finally { btn.disabled = false; btn.textContent = "Submit"; }
    };
  });
}

function findQ(form, name) {
  for (const s of form.sections) for (const q of s.questions) if (q.name === name) return q;
  return { name, type: "short text" };
}

function qHtml(si, qi, q) {
  const id = `q_${si}_${qi}`;
  const req = q.required ? " *" : "";
  const help = q.hint ? `<div class="help">${esc(q.hint)}</div>` : "";
  let input = "";
  switch (q.type) {
    case "paragraph": input = `<textarea id="${id}" rows="3"></textarea>`; break;
    case "integer": input = `<input id="${id}" type="number" step="1">`; break;
    case "decimal": input = `<input id="${id}" type="number" step="any">`; break;
    case "date": input = `<input id="${id}" type="date">`; break;
    case "time": input = `<input id="${id}" type="time">`; break;
    case "datetime": input = `<input id="${id}" type="datetime-local">`; break;
    case "single choice": case "dropdown":
      input = `<select id="${id}"><option value="">—</option>${(q.choices || []).map(c => `<option value="${esc(c.value)}">${esc(c.label_en || c.label)}</option>`).join("")}</select>`; break;
    case "multiple choice": case "ranking":
      input = `<div>${(q.choices || []).map(c => `<label class="checkline"><input type="checkbox" value="${esc(c.value)}"> ${esc(c.label_en || c.label)}</label>`).join("")}</div>`; break;
    case "yes/no": input = `<select id="${id}"><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>`; break;
    case "rating": case "scale": input = `<input id="${id}" type="number" min="1" max="10" step="1">`; break;
    case "gps point": input = `<div class="gpsbox" id="gps_${id}" data-gps="${q.name}"></div>`; break;
    case "draw polygon": case "draw line": input = `<div class="gpsbox" id="gps_${id}" data-draw="${q.name}"></div>`; break;
    case "photo": case "file": case "signature": input = `<input id="${id}" type="file" ${q.type === "photo" || q.type === "signature" ? 'accept="image/*"' : ""} capture="${q.type === "photo" ? "environment" : ""}">`; break;
    case "barcode": input = `<input id="${id}" type="text" placeholder="Scan or type code">`; break;
    case "lookup": input = `<div data-lookup="${q.name}" data-model="${esc(q.lookup || "")}"></div>`; break;
    case "calculation": input = `<input id="${id}" type="text" readonly>`; break;
    case "hidden": input = `<input id="${id}" type="hidden">`; break;
    case "note": case "instruction": return `<div class="notice" style="margin-bottom:10px">${esc(q.label_en)}</div>`;
    default: input = `<input id="${id}" type="text">`;
  }
  return `<label class="formfield" data-qname="${esc(q.name)}">${esc(q.label_en)}${req}${input}${help}</label>`;
}
