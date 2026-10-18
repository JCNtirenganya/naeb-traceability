export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFrom(seed) {
  let a = seed | 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const daysAgo = (r, max) => { const d = new Date(Date.UTC(2026, 7, 15)); d.setUTCDate(d.getUTCDate() - Math.floor(r() * max)); return d.toISOString().slice(0, 10); };

const EXPORTER_NAMES = [
  ["EXP-DEMO-01", "Kivu Highlands Coffee Exporters Ltd", "EXP-RW-2024-118", "Rubavu"],
  ["EXP-DEMO-02", "Umutara Coffee Export SARL", "EXP-RW-2026-142", "Rwamagana"],
  ["EXP-DEMO-03", "Nyungwe Origin Traders Ltd", "EXP-RW-2025-077", "Huye"],
  ["EXP-DEMO-04", "Akagera Coffee Company", "EXP-RW-2024-203", "Kayonza"]
];
const IMPORTER_ROWS = [
  ["IMP-DEMO-01", "NordCoffee Import GmbH", "Germany", "DE123456789012345"],
  ["IMP-DEMO-02", "Nordic Roasters AB", "Sweden", "SE556000000001"],
  ["IMP-DEMO-03", "Amsterdam Coffee Traders B.V.", "Netherlands", "NL812345678B01"],
  ["IMP-DEMO-04", "Torrefazione Alpina S.p.A.", "Italy", "IT12345678901"],
  ["IMP-DEMO-05", "Bellefontaine SAS", "France", "FR44321000123"]
];

export function generateDemoSuite(models, ctx) {
  const r = rngFrom(20260117);
  const out = {};
  const modelIds = new Set(models.filter(m => m.kind === "recordable" && !m.url).map(m => m.id));
  let stations = (ctx.cws || []).map(s => s.id);
  let farmers = [...new Set((ctx.farms || []).map(f => f.farmer_id).filter(Boolean))];
  // Fallbacks so the demo still works when signed out (no farm layer): use
  // clearly synthetic ids. When signed in, live CWS + farmer ids are used.
  if (!stations.length) stations = Array.from({ length: 6 }, (_, i) => "DEMO-CWS-" + String(i + 1).padStart(2, "0"));
  if (!farmers.length) farmers = Array.from({ length: 40 }, (_, i) => "DEMO-F-" + String(i + 1).padStart(4, "0"));

  out.exporter = EXPORTER_NAMES.map(([id, name, lic, dist]) => mk("exporter", {
    exporter_id: id, name, licence_no: lic, district: dist, country: "Rwanda",
    contact_person: "Demo contact", phone: "+250 78 000 0000", email: "demo@example.rw"
  }));
  out.importer = IMPORTER_ROWS.map(([id, name, country, eori]) => mk("importer", {
    importer_id: id, name, country, eori, contact_person: "Demo buyer", email: "buyer@example.com"
  }));

  const deliveries = [];
  let dlvN = 0;
  for (const st of stations) {
    const stFarmers = shuffle(farmers, r).slice(0, 4 + Math.floor(r() * 5));
    for (const fm of stFarmers) {
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        dlvN++;
        deliveries.push(mk("delivery", {
          delivery_id: `DEMO-DLV-${String(dlvN).padStart(4, "0")}`,
          cws_id: st, farmer_id: fm, plot_id: null,
          delivery_date: daysAgo(r, 90),
          weight_kg: Math.round((40 + r() * 90) * 10) / 10,
          grade: pick(r, ["A", "B", "C"]),
          price_per_kg: 400 + Math.floor(r() * 150),
          receipt_no: "RC-" + String(1000 + dlvN)
        }));
      }
    }
  }
  out.delivery = deliveries;

  const lots = [], lotLinks = [];
  let lotN = 0, linkN = 0;
  const deliveriesByStation = groupBy(deliveries, d => d.attrs.cws_id);
  for (const st of stations) {
    const ds = deliveriesByStation[st] || [];
    if (!ds.length) continue;
    const nLots = 1 + (r() > 0.6 ? 1 : 0);
    for (let i = 0; i < nLots; i++) {
      lotN++;
      const lotId = `DEMO-LOT-${String(lotN).padStart(3, "0")}`;
      const lot = mk("lot", {
        lot_id: lotId, cws_id: st, created_date: daysAgo(r, 70),
        cherry_kg_in: null, parchment_kg_out: null,
        process: pick(r, ["Washed", "Natural", "Honey"]), status: pick(r, ["Open", "Sold", "Shipped"])
      });
      lots.push(lot);
      const take = ds.slice(i === 0 ? 0 : Math.floor(ds.length / 2), Math.max(1, Math.floor(ds.length / (nLots - i || 1))));
      for (const d of take) {
        linkN++;
        lotLinks.push(mk("lot_delivery", {
          link_id: `DEMO-LL-${String(linkN).padStart(4, "0")}`,
          lot_id: lotId, delivery_id: d.attrs.delivery_id, kg_allocated: d.attrs.weight_kg
        }));
      }
      lot.attrs.cherry_kg_in = Math.round(take.reduce((t, d) => t + d.attrs.weight_kg, 0));
      lot.attrs.parchment_kg_out = Math.round(lot.attrs.cherry_kg_in * 0.2);
    }
  }
  out.lot = lots; out.lot_delivery = lotLinks;

  const batches = [], batchLinks = [];
  let batN = 0, blN = 0;
  const lotsByStation = groupBy(lots, l => l.attrs.cws_id);
  for (const exp of out.exporter) {
    const expStations = shuffle(stations, r).slice(0, 3);
    const expLots = expStations.flatMap(st => (lotsByStation[st] || []).slice(0, 1));
    if (!expLots.length) continue;
    const chunks = chunk(expLots, 2);
    for (const group of chunks) {
      batN++;
      const batchId = `DEMO-BAT-${String(batN).padStart(3, "0")}`;
      batches.push(mk("batch", {
        batch_id: batchId, exporter_id: exp.attrs.exporter_id,
        importer_id: pick(r, out.importer).attrs.importer_id,
        container: "MSKU" + Math.floor(1e6 + r() * 9e6),
        ship_date: daysAgo(r, 30),
        dds_ref: r() > 0.25 ? "DDS-2026-" + Math.floor(1e5 + r() * 9e5) : "",
        status: pick(r, ["Shipped", "Planned", "Delivered"])
      }));
      for (const l of group) {
        blN++;
        batchLinks.push(mk("batch_lot", {
          link_id: `DEMO-BL-${String(blN).padStart(4, "0")}`,
          batch_id: batchId, lot_id: l.attrs.lot_id, kg: l.attrs.parchment_kg_out || 500
        }));
      }
    }
  }
  out.batch = batches; out.batch_lot = batchLinks;

  for (const m of models) if (!(m.id in out)) out[m.id] = modelIds.has(m.id) ? genericDemo(m, r) : [];
  return out;
}

function mk(modelId, attrs) {
  return { id: "DEMO:" + modelId + ":" + (attrs[titleKey(modelId)] || Math.random()), modelId, attrs: { ...attrs, data_source: "indicative", is_active: 1 }, dataSource: "indicative", demo: true };
}
function titleKey(modelId) {
  return ({ exporter: "exporter_id", importer: "importer_id", delivery: "delivery_id", lot: "lot_id", batch: "batch_id", lot_delivery: "link_id", batch_lot: "link_id" })[modelId] || "id";
}

function genericDemo(model, r) {
  const key = model.titleField || model.fields[0]?.name || "id";
  const out = [];
  const n = 12;
  for (let i = 1; i <= n; i++) {
    const attrs = { data_source: "indicative", is_active: 1 };
    attrs[key] = `DEMO-${model.id.toUpperCase()}-${String(i).padStart(3, "0")}`;
    for (const f of model.fields) {
      if (f.name in attrs) continue;
      attrs[f.name] = genVal(f, r, i);
    }
    out.push({ id: "DEMO:" + model.id + ":" + attrs[key], modelId: model.id, attrs, dataSource: "indicative", demo: true });
  }
  return out;
}

function genVal(f, r, i) {
  switch (f.type) {
    case "string": case "text": return f.name.endsWith("_id") ? `DEMO-${f.name.toUpperCase()}-${i}` : (f.choices?.[0]?.value) || `Demo ${f.label || f.name}`;
    case "integer": return Math.floor(r() * 100);
    case "decimal": return Math.round(r() * 1000) / 10;
    case "date": case "datetime": return daysAgo(r, 120);
    case "boolean": return r() > 0.5 ? 1 : 0;
    case "choice": return f.choices?.[Math.floor(r() * f.choices.length)]?.value || null;
    case "multichoice": return (f.choices || []).slice(0, 1).map(c => c.value).join(",");
    default: return null;
  }
}

function shuffle(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function groupBy(arr, fn) { const m = {}; for (const x of arr) { const k = fn(x); (m[k] = m[k] || []).push(x); } return m; }
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

export function demoSessionStore() {
  const mem = new Map();
  return {
    get: (modelId) => mem.get(modelId) || [],
    set: (modelId, rows) => mem.set(modelId, rows),
    add: (modelId, row) => { const a = mem.get(modelId) || []; a.push(row); mem.set(modelId, a); },
    update: (modelId, id, attrs) => {
      const a = mem.get(modelId) || []; const i = a.findIndex(x => x.id === id);
      if (i >= 0) { a[i] = { ...a[i], attrs: { ...a[i].attrs, ...attrs } }; mem.set(modelId, a); }
    }
  };
}
