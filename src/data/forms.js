import { CFG } from "../config.js";
import { token, user } from "../core/auth.js";
import * as arc from "./arcgis.js";
import { hashStr } from "./demo.js";

const LS_KEY = "naeb_forms";
let forms = [];
let formsItemId = null;

export function allForms() { return forms; }
export function getForm(id) { return forms.find(f => f.id === id); }

export async function initForms() {
  const local = loadLocal();
  forms = local.length ? local : seedForms();
  const tk = token();
  if (!tk) return;
  try {
    let itemId = null;
    const found = await arc.findItemsByTitle(CFG.PORTAL, CFG.FORM_REGISTRY_TITLE, tk);
    const mine = found.find(i => i.type === "JSON");
    if (mine) itemId = mine.id;
    if (!itemId) return;
    const data = await arc.fetchItemData(CFG.PORTAL, itemId, tk);
    formsItemId = itemId;
    if (data && Array.isArray(data.forms)) forms = data.forms;
  } catch (e) { console.warn("Forms load:", e.message); }
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(forms)); }

export async function saveForms() {
  saveLocal();
  const tk = token();
  if (!tk) return null;
  const payload = JSON.stringify({ version: 1, updated: new Date().toISOString(), forms });
  formsItemId = await arc.saveItem(CFG.PORTAL, { id: formsItemId, title: CFG.FORM_REGISTRY_TITLE, type: "JSON", text: payload, folder: CFG.TRACE_FOLDER }, tk);
  return formsItemId;
}

export function upsertForm(def) {
  const i = forms.findIndex(f => f.id === def.id);
  if (i >= 0) forms[i] = def; else forms.push(def);
  saveLocal();
}

export function deleteForm(id) { forms = forms.filter(f => f.id !== id); saveLocal(); }

export function newForm() {
  return {
    id: "form-" + hashStr(Date.now() + Math.random()).toString(36),
    formId: "naeb_form_" + Date.now().toString(36),
    title: "Untitled form", targetModel: "", icon: "📝",
    sections: [{ title: "Section 1", questions: [] }],
    createdAt: new Date().toISOString()
  };
}

export function newQuestion(type = "short text") {
  return { id: "q" + Math.random().toString(36).slice(2, 8), type, name: "q_" + Math.random().toString(36).slice(2, 6), label_en: "New question", label_fr: "", label_rw: "", required: false, choices: [], relevant: "", calculation: "", default: "", hint: "" };
}

function seedForms() {
  return [{
    id: "form-delivery", formId: "cherry_delivery",
    title: "Cherry delivery (CWS intake)", targetModel: "delivery", icon: "🍒",
    sections: [{
      title: "Delivery details", questions: [
        { id: "q1", type: "lookup", name: "cws_id", label_en: "Washing station", lookup: "cws", required: true, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q2", type: "lookup", name: "farmer_id", label_en: "Farmer ID", lookup: "farmer", required: true, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q3", type: "date", name: "delivery_date", label_en: "Delivery date", required: true, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q4", type: "decimal", name: "weight_kg", label_en: "Cherry weight (kg)", required: true, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q5", type: "single choice", name: "grade", label_en: "Grade", choices: [{ value: "A", label: "A", label_en: "A" }, { value: "B", label: "B", label_en: "B" }, { value: "C", label: "C", label_en: "C" }], required: false, relevant: "", calculation: "", default: "", hint: "" },
        { id: "q6", type: "photo", name: "scale_ticket", label_en: "Scale ticket photo", required: false, choices: [], relevant: "", calculation: "", default: "", hint: "" }
      ]
    }],
    createdAt: new Date().toISOString()
  },
  {
    id: "form-farmvisit", formId: "farm_visit",
    title: "Farm visit — geolocation", targetModel: "farm", icon: "🌿",
    sections: [{
      title: "Farm", questions: [
        { id: "q1", type: "lookup", name: "plot_id", label_en: "Farm plot", lookup: "farm", required: true, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q2", type: "draw polygon", name: "plot_shape", label_en: "Plot boundary", required: false, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q3", type: "yes/no", name: "shade_trees", label_en: "Shade trees present?", required: false, choices: [], relevant: "", calculation: "", default: "", hint: "" },
        { id: "q4", type: "note", name: "note1", label_en: "Record any evidence of recent land-use change.", required: false, choices: [], relevant: "", calculation: "", default: "", hint: "" }
      ]
    }]
  }];
}
