const te = new TextEncoder();
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  return CRC_TABLE;
}
function crc32(bytes) {
  const t = crcTable(); let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

export function makeZip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = te.encode(f.name);
    const data = typeof f.data === "string" ? te.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    chunks.push(new Uint8Array(local), nameBytes, data);
    central.push({ nameBytes, crc, size: data.length, offset });
    offset += local.length + nameBytes.length + data.length;
  }
  const centralStart = offset;
  const cdChunks = [];
  for (const c of central) {
    const hdr = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)];
    cdChunks.push(new Uint8Array(hdr), c.nameBytes);
    offset += hdr.length + c.nameBytes.length;
  }
  const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - centralStart), ...u32(centralStart), ...u16(0)];
  const all = [...chunks, ...cdChunks, new Uint8Array(eocd)];
  const total = all.reduce((t, a) => t + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

function xmlEsc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c])); }

function colName(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function sheetXml(rows) {
  const body = rows.map((row, ri) => {
    const cells = row.map((v, ci) => {
      if (v == null || v === "") return "";
      const ref = colName(ci) + (ri + 1);
      if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const XLS_TYPE = {
  "short text": "text", "paragraph": "text", "integer": "integer", "decimal": "decimal",
  "date": "date", "time": "time", "datetime": "dateTime", "single choice": "select_one",
  "multiple choice": "select_multiple", "dropdown": "select_one", "yes/no": "select_one yesno",
  "rating": "integer", "scale": "integer", "ranking": "text",
  "gps point": "geopoint", "draw line": "geoline", "draw polygon": "geoshape",
  "photo": "image", "file": "file", "signature": "image", "barcode": "barcode",
  "lookup": "text", "calculation": "calculate", "hidden": "calculate", "note": "note", "instruction": "note"
};

export function toXlsForm(form) {
  const survey = [["type", "name", "label::English (en)", "label::Français (fr)", "label::Kinyarwanda (rw)", "required", "relevant", "calculation", "choice_filter", "default", "appearance", "hint"]];
  const choices = [["list_name", "name", "label::English (en)", "label::Français (fr)", "label::Kinyarwanda (rw)"]];
  const seenLists = new Set();
  let groupStack = [];

  const walk = (qs, groupName) => {
    if (groupName) survey.push(["begin_group", safeName(groupName), groupName, "", "", "", "", "", "", "", "", ""]);
    for (const q of qs) {
      const base = XLS_TYPE[q.type] || "text";
      let type = base, name = q.name || safeName(q.label || "q");
      if (base === "select_one" || base === "select_multiple") {
        const listName = "l_" + name;
        type = base + " " + listName;
        if (!seenLists.has(listName)) {
          seenLists.add(listName);
          for (const c of (q.choices || [])) choices.push([listName, c.value, c.label_en || c.label, c.label_fr || "", c.label_rw || ""]);
        }
      }
      if (q.type === "yes/no") {
        if (!seenLists.has("yesno")) { seenLists.add("yesno"); choices.push(["yesno", "yes", "Yes", "Oui", "Yego"], ["yesno", "no", "No", "Non", "Oya"]); }
      }
      survey.push([
        type, name, q.label_en || q.label || name, q.label_fr || "", q.label_rw || "",
        q.required ? "yes" : "", q.relevant || "", q.calculation || "", q.choice_filter || "", q.default ?? "", q.appearance || "", q.hint || ""
      ]);
    }
    if (groupName) survey.push(["end_group", "", "", "", "", "", "", "", "", "", "", ""]);
  };
  for (const sec of (form.sections || [])) walk(sec.questions || [], sec.title);

  const settings = [["form_title", "form_id", "version", "default_language"], [form.title || "NAEB form", form.formId || safeName(form.title || "form"), "1", "English (en)"]];

  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="survey" sheetId="1" r:id="rId1"/><sheet name="choices" sheetId="2" r:id="rId2"/><sheet name="settings" sheetId="3" r:id="rId3"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(survey) },
    { name: "xl/worksheets/sheet2.xml", data: sheetXml(choices) },
    { name: "xl/worksheets/sheet3.xml", data: sheetXml(settings) }
  ];
  return makeZip(files);
}

export function downloadXlsForm(form) {
  const bytes = toXlsForm(form);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeName(form.title || "form") + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function safeName(s) { return String(s || "item").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "item"; }
