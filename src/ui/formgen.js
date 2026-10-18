import { esc } from "./components.js";
import R, { recordsOf, getModel, titleOf, get } from "../data/registry.js";

export function fieldInput(f, value, opts = {}) {
  const id = "f_" + f.name;
  const v = value ?? f.default ?? "";
  const req = f.required ? "required" : "";
  const disabled = opts.readonly ? "disabled" : "";
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : "";
  let input = "";
  switch (f.type) {
    case "text": input = `<textarea id="${id}" name="${f.name}" rows="3" ${req} ${disabled}>${esc(v)}</textarea>`; break;
    case "integer": case "decimal":
      input = `<input id="${id}" name="${f.name}" type="number" ${f.type === "decimal" ? 'step="any"' : 'step="1"'} value="${esc(v)}" ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} ${req} ${disabled}>`; break;
    case "date": input = `<input id="${id}" name="${f.name}" type="date" value="${esc(String(v).slice(0, 10))}" ${req} ${disabled}>`; break;
    case "datetime": input = `<input id="${id}" name="${f.name}" type="datetime-local" value="${esc(v)}" ${req} ${disabled}>`; break;
    case "boolean": input = `<label class="checkline"><input id="${id}" name="${f.name}" type="checkbox" ${v ? "checked" : ""} ${disabled}> ${esc(f.label)}</label>`; break;
    case "choice": input = `<select id="${id}" name="${f.name}" ${req} ${disabled}><option value="">—</option>${(f.choices || []).map(c => `<option value="${esc(c.value)}" ${String(v) === String(c.value) ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`; break;
    case "multichoice": {
      const cur = String(v || "").split(",").filter(Boolean);
      input = `<div id="${id}" data-multi="${f.name}">${(f.choices || []).map(c => `<label class="checkline"><input type="checkbox" value="${esc(c.value)}" ${cur.includes(c.value) ? "checked" : ""} ${disabled}> ${esc(c.label)}</label>`).join("")}</div>`; break;
    }
    case "lookup": input = `<div data-lookup="${f.name}" data-model="${f.model}" data-required="${!!f.required}" data-readonly="${!!opts.readonly}" data-value="${esc(v)}"></div>`; break;
    case "file": input = `<input id="${id}" name="${f.name}" type="file" ${disabled}>`; break;
    default: input = `<input id="${id}" name="${f.name}" type="text" value="${esc(v)}" ${f.length ? `maxlength="${f.length}"` : ""} ${req} ${disabled}>`;
  }
  const wrapped = f.type === "boolean" ? `<div class="formfield" data-field="${f.name}">${input}${help}<div class="err" data-err="${f.name}" hidden></div></div>`
    : `<label class="formfield" data-field="${f.name}">${esc(f.label)}${f.required ? " *" : ""}${input}${help}<div class="err" data-err="${f.name}" hidden></div></label>`;
  return wrapped;
}

export function buildForm(model, record) {
  const vals = record?.attrs || {};
  const fields = model.fields.filter(f => f.type !== "file");
  return `<form id="recform" class="recform" novalidate><div class="fieldgrid">
    ${fields.map(f => fieldInput(f, vals[f.name])).join("")}
  </div></form>`;
}

export function lookupOptions(targetModelId) {
  const tm = getModel(targetModelId);
  if (!tm) return [];
  return recordsOf(targetModelId).filter(r => !(tm.softDelete && r.attrs[tm.softDelete] === 0))
    .map(r => ({ value: r.id, label: titleOf(tm, r), sub: r.attrs?.district || r.attrs?.sector || "" }));
}

export function wireForm(container, model, record) {
  container.querySelectorAll("[data-lookup]").forEach(async (el) => {
    const { combobox } = await import("./components.js");
    const name = el.dataset.lookup, mid = el.dataset.model;
    const opts = lookupOptions(mid);
    combobox(el, {
      options: opts, value: el.dataset.value, placeholder: "Select " + (getModel(mid)?.name || mid),
      onChange: () => {}
    });
    el.dataset.wired = "1";
  });
}

export function collectForm(container) {
  const out = {};
  const errs = [];
  container.querySelectorAll("[data-field]").forEach(el => {
    const name = el.dataset.field;
    const errBox = el.querySelector(`[data-err="${name}"]`);
    const camel = container.querySelector(`[name="${name}"]`);
    let val;
    const multi = container.querySelector(`[data-multi="${name}"]`);
    const lookup = container.querySelector(`[data-lookup="${name}"]`);
    if (multi) val = [...multi.querySelectorAll("input:checked")].map(i => i.value).join(",");
    else if (lookup) {
      const inp = lookup.querySelector("input");
      val = lookup._value || (inp && inp.value) || "";
      const selectedText = inp ? inp.value : "";
      const accepted = !lookup.dataset.required || (selectedText && !/^select /i.test(selectedText));
      if (lookup.dataset.required && !selectedText) { val = ""; }
    } else if (camel && camel.type === "checkbox") val = camel.checked;
    else val = camel ? camel.value : "";
    if (camel && camel.type === "number" && val !== "") val = Number(val);
    out[name] = val;
    if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
  });
  return { values: out, errors: errs };
}

export function validateForm(model, values, container) {
  const errors = [];
  for (const f of model.fields) {
    if (f.type === "file") continue;
    const v = values[f.name];
    const empty = v === "" || v == null || (Array.isArray(v) && !v.length);
    if (f.required && empty) errors.push({ field: f.name, msg: f.label + " is required" });
    if (!empty && (f.type === "integer" || f.type === "decimal")) {
      if (isNaN(Number(v))) errors.push({ field: f.name, msg: f.label + " must be a number" });
      else if (f.min != null && Number(v) < f.min) errors.push({ field: f.name, msg: f.label + ` must be ≥ ${f.min}` });
      else if (f.max != null && Number(v) > f.max) errors.push({ field: f.name, msg: f.label + ` must be ≤ ${f.max}` });
    }
    if (f.unique && !empty) {
      const dup = recordsOf(model.id).find(r => r.id !== (model._editingId) && String(r.attrs[f.name]) === String(v));
      if (dup) errors.push({ field: f.name, msg: f.label + " must be unique" });
    }
  }
  showErrors(container, errors);
  return errors;
}

export function showErrors(container, errors) {
  container.querySelectorAll("[data-err]").forEach(e => { e.hidden = true; });
  container.querySelectorAll(".formfield").forEach(e => e.classList.remove("haserr"));
  for (const e of errors) {
    const box = container.querySelector(`[data-err="${e.field}"]`);
    if (box) { box.hidden = false; box.textContent = e.msg; box.closest(".formfield")?.classList.add("haserr"); }
  }
}
