import { urlToken, user } from "../core/auth.js";

async function jget(url) {
  let r;
  try { r = await fetch(url); }
  catch { throw new Error("Network/CORS: cannot reach " + new URL(url).host + ". Check the service allows requests from this site."); }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "ArcGIS error " + d.error.code);
  return d;
}

async function jpost(url, params) {
  let r;
  try {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  } catch {
    throw new Error("Network/CORS: cannot reach " + new URL(url).host + ".");
  }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "ArcGIS error " + d.error.code);
  return d;
}

export async function queryLayer(url, opts = {}) {
  const {
    where = "1=1", outFields = "*", returnGeometry = true, geometry = null,
    maxAllowableOffset = null, orderBy = null, outSR = 4326, resultRecordCount = 1000, token = null
  } = opts;
  let out = [], offset = 0;
  for (;;) {
    const p = new URLSearchParams({
      where, outFields, returnGeometry: String(returnGeometry), f: "json",
      outSR: String(outSR), resultOffset: String(offset), resultRecordCount: String(resultRecordCount)
    });
    if (geometry) { p.set("geometry", JSON.stringify(geometry)); p.set("geometryType", opts.geometryType || "esriGeometryEnvelope"); p.set("spatialRel", "esriSpatialRelIntersects"); }
    if (maxAllowableOffset) p.set("maxAllowableOffset", String(maxAllowableOffset));
    if (orderBy) { p.set("orderByFields", orderBy); p.set("supportsPagination", "true"); }
    const d = await jget(urlToken(url + "/query?" + p, token));
    out = out.concat(d.features || []);
    if (!d.exceededTransferLimit || !(d.features || []).length) break;
    offset += resultRecordCount;
    if (offset > 200000) break;
  }
  return out;
}

export async function queryStats(url, opts = {}) {
  const p = new URLSearchParams({
    f: "json", where: opts.where || "1=1", outStatistics: JSON.stringify(opts.outStatistics),
    groupByFieldsForStatistics: opts.groupBy || ""
  });
  if (opts.token) p.set("token", opts.token);
  const d = await jget(url + "/query?" + p);
  return d.features || [];
}

export async function applyEdits(url, { adds = [], updates = [], deletes = [] }, token) {
  const p = new URLSearchParams({
    f: "json",
    adds: JSON.stringify(adds), updates: JSON.stringify(updates), deletes: JSON.stringify(deletes)
  });
  const d = await jpost(urlToken(url + "/applyEdits", token), p);
  const errs = [];
  for (const r of (d.addResults || [])) if (r.error) errs.push(r.error.message);
  for (const r of (d.updateResults || [])) if (r.error) errs.push(r.error.message);
  for (const r of (d.deleteResults || [])) if (r.error) errs.push(r.error.message);
  if (errs.length) throw new Error(errs.join("; "));
  return d;
}

export async function queryAttachments(url, oid, token) {
  try {
    const d = await jget(urlToken(`${url}/${oid}/queryAttachments?f=json&attachmentTypes=file`, token));
    return d.attachmentInfos || [];
  } catch { return []; }
}

export async function uploadAttachment(url, oid, params, file, token) {
  const form = new FormData();
  form.append("f", "json");
  form.append("attachment", file);
  form.append("token", token || "");
  const r = await fetch(`${url}/${oid}/addAttachment`, { method: "POST", body: form });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function ensureFolder(portal, folder, token) {
  const d = await jget(urlToken(`${portal}/sharing/rest/content/users/${encodeURIComponent(currentUser())}/folders?f=json`, token));
  const found = (d.items || []).find(f => f.title === folder);
  if (found) return found.id;
  const c = await jpost(urlToken(`${portal}/sharing/rest/content/users/${encodeURIComponent(currentUser())}/addItem`, token),
    new URLSearchParams({ f: "json", title: folder, type: "Folder" }));
  return c.id;
}

let _user = null;
export function setCurrentUser(u) { _user = u; }
export function currentUser() { return _user || user()?.username || "me"; }

export async function findItemsByTitle(portal, title, token) {
  const p = new URLSearchParams({ f: "json", q: `title:"${title}" owner:${currentUser()}`, num: "50" });
  const d = await jget(urlToken(portal + "/sharing/rest/search?" + p, token));
  return d.results || [];
}

export async function fetchItem(portal, itemId, token) {
  return jget(urlToken(`${portal}/sharing/rest/content/items/${itemId}?f=json`, token));
}

export async function fetchItemData(portal, itemId, token) {
  return jget(urlToken(`${portal}/sharing/rest/content/items/${itemId}/data?f=json`, token));
}

export async function saveItem(portal, { id = null, title, type = "JSON", text, folder = "" }, token) {
  if (id) {
    const p = new URLSearchParams({ f: "json", text });
    await jpost(urlToken(`${portal}/sharing/rest/content/items/${id}/update`, token), p);
    return id;
  }
  const p = new URLSearchParams({ f: "json", title, type, text });
  if (folder) p.set("folder", folder);
  const d = await jpost(urlToken(`${portal}/sharing/rest/content/users/${encodeURIComponent(currentUser())}/addItem`, token), p);
  if (!d.id) throw new Error("Could not create portal item");
  return d.id;
}

export function esriFieldDef(f) {
  const base = { name: f.name.toLowerCase(), alias: f.label || f.name, nullable: !f.required };
  switch (f.type) {
    case "string": case "lookup": case "choice":
      return { ...base, type: "esriFieldTypeString", length: f.length || (f.type === "text" ? 2000 : 255) };
    case "text":
      return { ...base, type: "esriFieldTypeString", length: 2000 };
    case "integer": return { ...base, type: "esriFieldTypeInteger" };
    case "decimal": return { ...base, type: "esriFieldTypeDouble" };
    case "date": case "datetime": return { ...base, type: "esriFieldTypeDate" };
    case "boolean": return { ...base, type: "esriFieldTypeSmallInteger" };
    case "multichoice": return { ...base, type: "esriFieldTypeString", length: 1000 };
    default: return { ...base, type: "esriFieldTypeString", length: 255 };
  }
}

function layerDefinition(model) {
  const fields = [
    { name: "objectid", type: "esriFieldTypeOID", alias: "OBJECTID", nullable: false },
    ...model.fields.filter(f => f.name !== "objectid").map(esriFieldDef)
  ];
  if (!fields.some(f => f.name === "globalid"))
    fields.push({ name: "globalid", type: "esriFieldTypeGlobalID", alias: "globalid", nullable: false, length: 38 });
  if (!fields.some(f => f.name === "created_user"))
    fields.push(
      { name: "created_user", type: "esriFieldTypeString", alias: "created_user", length: 255, nullable: true },
      { name: "created_date", type: "esriFieldTypeDate", alias: "created_date", nullable: true },
      { name: "edited_user", type: "esriFieldTypeString", alias: "edited_user", length: 255, nullable: true },
      { name: "edited_date", type: "esriFieldTypeDate", alias: "edited_date", nullable: true }
    );
  const geom = model.storage !== "table";
  const def = {
    name: "0", displayName: model.plural || model.name,
    type: geom ? "Feature Layer" : "Table",
    geometryType: model.storage === "point" ? "esriGeometryPoint" : model.storage === "line" ? "esriGeometryPolyline" : model.storage === "polygon" ? "esriGeometryPolygon" : null,
    fields, hasAttachments: !!model.attachments, objectIdField: "objectid", globalIdField: "globalid",
    capabilities: "Query,Create,Update,Delete,Editing",
    defaultVisibility: true, maxRecordCount: 2000
  };
  if (model.storage === "point") {
    def.extent = { xmin: 28.5, ymin: -3.2, xmax: 31.2, ymax: -0.8, spatialReference: { wkid: 4326 } };
    def.drawingInfo = { renderer: { type: "simple", symbol: { type: "esriSMS", style: "esriSMSCircle", color: [122, 92, 62, 200], size: 9, outline: { color: [255, 255, 255, 200], width: 1 } } } };
  }
  return def;
}

export async function publishModelLayer(portal, model, folderId, token) {
  const svcName = ("NAEB_Trace_" + model.id).replace(/[^A-Za-z0-9_]/g, "_");
  const createParameters = {
    name: svcName,
    serviceDescription: `${model.plural} — created by NAEB Coffee Traceability`,
    hasVersionedData: false, supportsDisconnectedEditing: false, syncEnabled: false,
    maxRecordCount: 2000, supportedQueryFormats: "JSON, geoJSON, PBF",
    capabilities: "Query,Create,Update,Delete,Editing",
    enableEditorTracking: true,
    allowGeometryUpdates: model.storage !== "table",
    hasAttachments: !!model.attachments,
    layers: [], tables: []
  };
  const p = new URLSearchParams({ f: "json", createParameters: JSON.stringify(createParameters) });
  if (folderId) p.set("folderId", folderId);
  const created = await jpost(urlToken(`${portal}/sharing/rest/content/users/${encodeURIComponent(currentUser())}/createService`, token), p);
  const svcUrl = created.serviceurl || (created.itemId ? null : null);
  if (!svcUrl) throw new Error(created.error?.message || "createService did not return a service URL");
  const full = svcUrl.startsWith("http") ? svcUrl : `${portal.replace("/portal", "")}${svcUrl}`;
  const def = layerDefinition(model);
  const addParams = new URLSearchParams({ f: "json", addToDefinition: JSON.stringify(model.storage === "table" ? { tables: [def] } : { layers: [def] }), pruneOnError: "true" });
  await jpost(urlToken(full + "/addToDefinition", token), addParams);
  const itemMeta = await jget(urlToken(`${portal}/sharing/rest/content/items/${created.itemId}?f=json`, token));
  const layerUrl = `${full}/${model.storage === "table" ? 0 : 0}`;
  return { url: layerUrl, itemId: created.itemId, folderId: itemMeta.owner ? folderId : folderId };
}

export async function layerFields(url, token) {
  const d = await jget(urlToken(url + "?f=json", token));
  return d.fields || [];
}

export async function addMissingFields(url, model, token) {
  const existing = (await layerFields(url, token)).map(f => f.name.toLowerCase());
  const missing = model.fields.filter(f => !existing.includes(f.name.toLowerCase()));
  if (!missing.length) return { added: 0 };
  const def = { tables: [{ name: "0", fields: missing.map(esriFieldDef) }] };
  const def2 = { layers: [{ name: "0", fields: missing.map(esriFieldDef) }] };
  try {
    await jpost(urlToken(url + "/addToDefinition", token),
      new URLSearchParams({ f: "json", addToDefinition: JSON.stringify(missing && model.storage === "table" ? def : def2) }));
  } catch (e) {
    if (model.storage !== "table") {
      await jpost(urlToken(url + "/addToDefinition", token),
        new URLSearchParams({ f: "json", addToDefinition: JSON.stringify(def2) }));
    } else throw e;
  }
  return { added: missing.length };
}

export async function serviceDefinition(url, token) {
  return jget(urlToken(url + "?f=json", token));
}

export { jget, jpost };
