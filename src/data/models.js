export const SYSTEM_MODELS = [
  {
    id: "cws", name: "Washing station", plural: "Washing stations", icon: "🏭", color: "#3b6ea5",
    kind: "system-live", storage: "point", url: "@CWS", titleField: "name",
    attachments: false, editorTracking: false, softDelete: null,
    searchable: true, onMap: true, inGraph: true,
    fields: [
      { name: "id", label: "Station ID", type: "string", showInList: true },
      { name: "name", label: "Name", type: "string", required: true, showInList: true },
      { name: "owner", label: "Owner", type: "string", showInList: true },
      { name: "district", label: "District", type: "string", showInList: true },
      { name: "sector", label: "Sector", type: "string", showInList: true },
      { name: "cell", label: "Cell", type: "string" },
      { name: "capacity_mt", label: "Capacity (MT)", type: "integer" },
      { name: "phone", label: "Phone", type: "string" },
      { name: "email", label: "Email", type: "string" },
      { name: "year_est", label: "Year established", type: "integer" },
      { name: "ownership", label: "Ownership type", type: "string" },
      { name: "contact_info", label: "Contact", type: "string" },
      { name: "x", label: "X", type: "decimal" }, { name: "y", label: "Y", type: "decimal" }
    ],
    listColumns: ["name", "sector", "district", "capacity_mt"],
    profileFields: ["name", "owner", "district", "sector", "cell", "capacity_mt", "phone", "email", "year_est", "ownership", "contact_info"],
    fieldMap: {
      id: a => (a.globalid || "").replace(/[{}]/g, "").toLowerCase(),
      name: a => (a.cws_name || a.name_of_cw || "").trim(),
      owner: a => a.owner_name, district: a => a.district, sector: a => a.sector, cell: a => a.cell,
      capacity_mt: a => a.processing_capacity, phone: a => a.telephone, email: a => a.f_email,
      year_est: a => (a.year_of_establishment > 1900 ? a.year_of_establishment : null),
      ownership: a => a.type_of_ownership, contact_info: a => a.contact_information,
      x: a => a.x_coordinate, y: a => a.y_coordinate
    },
    latField: "y", lngField: "x"
  },
  {
    id: "farm", name: "Farm (plot)", plural: "Farms", icon: "🌿", color: "#2f6b4f",
    kind: "system-live", storage: "polygon", url: "@FARMS", titleField: "plot_id",
    attachments: false, editorTracking: true, softDelete: null,
    searchable: true, onMap: true, inGraph: true,
    dateField: "CreationDate", dateFieldFallback: "first_planting_year",
    fields: [
      { name: "plot_id", label: "Plot ID", type: "string", showInList: true },
      { name: "farmer_id", label: "Farmer ID", type: "string", showInList: true },
      { name: "farmer_name", label: "Farmer name", type: "string" },
      { name: "district", label: "District", type: "string", showInList: true },
      { name: "sector", label: "Sector", type: "string", showInList: true },
      { name: "cell", label: "Cell", type: "string" },
      { name: "area_ha", label: "Area (ha)", type: "decimal", showInList: true },
      { name: "trees_total", label: "Trees", type: "integer" },
      { name: "prod_kg_2025", label: "2025 output (kg)", type: "decimal" },
      { name: "prior_land_use", label: "Prior land use", type: "string" },
      { name: "first_planting_year", label: "First planted", type: "integer" },
      { name: "overlaps_other_plot", label: "Overlap flag", type: "string" },
      { name: "mapped_date", label: "Mapped date", type: "date" }
    ],
    listColumns: ["plot_id", "farmer_id", "sector", "area_ha"],
    profileFields: ["plot_id", "farmer_id", "farmer_name", "district", "sector", "cell", "area_ha", "trees_total", "prod_kg_2025", "prior_land_use", "first_planting_year"],
    fieldMap: {
      plot_id: a => (a.plot_id == null ? null : String(a.plot_id)),
      farmer_id: a => (a.farmer_id == null ? null : String(a.farmer_id)),
      farmer_name: a => a.farmer_name, district: a => a.district, sector: a => a.sector, cell: a => a.cell,
      area_ha: a => a.area_ha, trees_total: a => a.trees_total,
      prod_kg_2025: a => (a.farmer_prod_kg_2025 > 100000 ? null : a.farmer_prod_kg_2025),
      prior_land_use: a => a.prior_land_use, first_planting_year: a => a.first_planting_year,
      overlaps_other_plot: a => a.overlaps_other_plot,
      mapped_date: a => a.CreationDate ?? a.created_date ?? null
    }
  }
];

const SYS = [
  { name: "data_source", label: "Data source", type: "choice", choices: [{ value: "recorded", label: "Recorded" }, { value: "indicative", label: "Indicative" }], default: "recorded", showInList: true, help: "Set by the app; recorded = entered here." },
  { name: "is_active", label: "Active", type: "boolean", default: true, help: "Soft delete: inactive records stay for audit but are hidden." },
  { name: "notes", label: "Notes", type: "text" }
];

const F = {
  str: (name, label, extra = {}) => ({ name, label, type: "string", length: 255, ...extra }),
  text: (name, label, extra = {}) => ({ name, label, type: "text", ...extra }),
  int: (name, label, extra = {}) => ({ name, label, type: "integer", ...extra }),
  dec: (name, label, extra = {}) => ({ name, label, type: "decimal", ...extra }),
  date: (name, label, extra = {}) => ({ name, label, type: "date", ...extra }),
  dt: (name, label, extra = {}) => ({ name, label, type: "datetime", ...extra }),
  bool: (name, label, extra = {}) => ({ name, label, type: "boolean", ...extra }),
  choice: (name, label, choices, extra = {}) => ({ name, label, type: "choice", choices: choices.map(c => typeof c === "string" ? { value: c, label: c } : c), ...extra }),
  lookup: (name, label, model, extra = {}) => ({ name, label, type: "lookup", model, ...extra })
};

export const SEED_MODELS = [
  {
    id: "exporter", name: "Exporter", plural: "Exporters", icon: "🚢", color: "#6b5b95",
    kind: "recordable", storage: "table", url: "", titleField: "name",
    attachments: true, editorTracking: true, softDelete: "is_active",
    searchable: true, onMap: false, inGraph: true,
    fields: [
      F.str("exporter_id", "Exporter ID", { required: true, unique: true, showInList: true, help: "Code you choose, e.g. EXP-RW-001" }),
      F.str("name", "Name", { required: true, showInList: true }),
      F.str("licence_no", "Licence number", { showInList: true }),
      F.str("contact_person", "Contact person"),
      F.str("phone", "Phone"), F.str("email", "Email"),
      F.str("district", "District", { showInList: true }),
      F.str("country", "Country", { default: "Rwanda" }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["exporter_id", "name", "licence_no", "district"],
    profileFields: ["exporter_id", "name", "licence_no", "contact_person", "phone", "email", "district", "country"]
  },
  {
    id: "importer", name: "Importer", plural: "Importers", icon: "🇪🇺", color: "#4b5a50",
    kind: "recordable", storage: "table", url: "", titleField: "name",
    attachments: true, editorTracking: true, softDelete: "is_active",
    searchable: true, onMap: false, inGraph: true,
    fields: [
      F.str("importer_id", "Importer ID", { required: true, unique: true, showInList: true }),
      F.str("name", "Name", { required: true, showInList: true }),
      F.str("country", "Country", { required: true, showInList: true }),
      F.str("eori", "EORI number", { showInList: true }),
      F.str("contact_person", "Contact person"), F.str("phone", "Phone"), F.str("email", "Email"),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["importer_id", "name", "country", "eori"],
    profileFields: ["importer_id", "name", "country", "eori", "contact_person", "phone", "email"]
  },
  {
    id: "delivery", name: "Cherry delivery", plural: "Cherry deliveries", icon: "🍒", color: "#a23e2c",
    kind: "recordable", storage: "table", url: "", titleField: "delivery_id",
    attachments: true, editorTracking: true, softDelete: "is_active",
    searchable: true, onMap: false, inGraph: true,
    fields: [
      F.str("delivery_id", "Delivery ID", { required: true, unique: true, showInList: true }),
      F.lookup("cws_id", "Washing station (CWS)", "cws", { required: true, showInList: true }),
      F.lookup("farmer_id", "Farmer", "farmer", { required: true, showInList: true, help: "Farmer ID from the farms layer" }),
      F.lookup("plot_id", "Plot (optional)", "farm", { help: "Leave empty to mean 'all plots of this farmer' — flagged as less precise" }),
      F.date("delivery_date", "Delivery date", { required: true, showInList: true }),
      F.dec("weight_kg", "Cherry weight (kg)", { required: true, min: 0, showInList: true }),
      F.choice("grade", "Grade", ["A", "B", "C"]),
      F.dec("price_per_kg", "Price per kg (RWF)"),
      F.str("receipt_no", "Receipt number", { showInList: true }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["delivery_id", "delivery_date", "cws_id", "farmer_id", "weight_kg"],
    profileFields: ["delivery_id", "delivery_date", "cws_id", "farmer_id", "plot_id", "weight_kg", "grade", "price_per_kg", "receipt_no"]
  },
  {
    id: "lot", name: "Lot (parchment)", plural: "Lots", icon: "📦", color: "#c99a3a",
    kind: "recordable", storage: "table", url: "", titleField: "lot_id",
    attachments: true, editorTracking: true, softDelete: "is_active",
    searchable: true, onMap: false, inGraph: true,
    fields: [
      F.str("lot_id", "Lot ID", { required: true, unique: true, showInList: true, help: "e.g. LOT-2026-A14" }),
      F.lookup("cws_id", "Washing station", "cws", { required: true, showInList: true }),
      F.date("created_date", "Created date", { required: true, showInList: true }),
      F.dec("cherry_kg_in", "Cherry in (kg)"),
      F.dec("parchment_kg_out", "Parchment out (kg)"),
      F.choice("process", "Process", ["Washed", "Natural", "Honey"]),
      F.choice("status", "Status", ["Open", "Sold", "Shipped", "Closed"], { default: "Open", showInList: true }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["lot_id", "cws_id", "created_date", "process", "status"],
    profileFields: ["lot_id", "cws_id", "created_date", "cherry_kg_in", "parchment_kg_out", "process", "status"]
  },
  {
    id: "lot_delivery", name: "Lot–delivery link", plural: "Lot–delivery links", icon: "🔗", color: "#8a7e6a",
    kind: "recordable", storage: "table", url: "", titleField: "link_id",
    attachments: false, editorTracking: true, softDelete: "is_active",
    searchable: false, onMap: false, inGraph: false,
    fields: [
      F.str("link_id", "Link ID", { required: true, unique: true, showInList: true }),
      F.lookup("lot_id", "Lot", "lot", { required: true, showInList: true }),
      F.lookup("delivery_id", "Delivery", "delivery", { required: true, showInList: true }),
      F.dec("kg_allocated", "Cherry kg allocated", { min: 0, showInList: true }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["link_id", "lot_id", "delivery_id", "kg_allocated"],
    profileFields: ["link_id", "lot_id", "delivery_id", "kg_allocated"]
  },
  {
    id: "batch", name: "Export batch", plural: "Export batches", icon: "🗳️", color: "#2b4c6f",
    kind: "recordable", storage: "table", url: "", titleField: "batch_id",
    attachments: true, editorTracking: true, softDelete: "is_active",
    searchable: true, onMap: false, inGraph: true,
    fields: [
      F.str("batch_id", "Batch ID", { required: true, unique: true, showInList: true }),
      F.lookup("exporter_id", "Exporter", "exporter", { required: true, showInList: true }),
      F.lookup("importer_id", "Importer", "importer", { showInList: true }),
      F.str("container", "Container ref", { showInList: true }),
      F.date("ship_date", "Ship date", { showInList: true }),
      F.str("dds_ref", "DDS reference", { showInList: true, help: "EU due-diligence statement reference" }),
      F.choice("status", "Status", ["Planned", "Shipped", "Delivered", "Cancelled"], { default: "Planned", showInList: true }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["batch_id", "ship_date", "exporter_id", "importer_id", "dds_ref", "status"],
    profileFields: ["batch_id", "exporter_id", "importer_id", "container", "ship_date", "dds_ref", "status"]
  },
  {
    id: "batch_lot", name: "Batch–lot link", plural: "Batch–lot links", icon: "🔗", color: "#8a7e6a",
    kind: "recordable", storage: "table", url: "", titleField: "link_id",
    attachments: false, editorTracking: true, softDelete: "is_active",
    searchable: false, onMap: false, inGraph: false,
    fields: [
      F.str("link_id", "Link ID", { required: true, unique: true, showInList: true }),
      F.lookup("batch_id", "Batch", "batch", { required: true, showInList: true }),
      F.lookup("lot_id", "Lot", "lot", { required: true, showInList: true }),
      F.dec("kg", "Parchment kg", { min: 0, showInList: true }),
      ...SYS.map(f => ({ ...f }))
    ],
    listColumns: ["link_id", "batch_id", "lot_id", "kg"],
    profileFields: ["link_id", "batch_id", "lot_id", "kg"]
  },
  {
    id: "farmer", name: "Farmer", plural: "Farmers", icon: "👤", color: "#7a5c3e",
    kind: "system-derived", storage: "table", url: "", titleField: "farmer_id",
    attachments: false, editorTracking: false, softDelete: null,
    searchable: true, onMap: false, inGraph: true,
    fields: [
      { name: "farmer_id", label: "Farmer ID", type: "string", showInList: true },
      { name: "farmer_name", label: "Name", type: "string", showInList: true, help: "PII — live only, never committed" },
      { name: "district", label: "District", type: "string" },
      { name: "sector", label: "Sector", type: "string", showInList: true },
      { name: "cell", label: "Cell", type: "string" },
      { name: "plot_count", label: "Plots", type: "integer" },
      { name: "area_ha", label: "Area (ha)", type: "decimal" },
      { name: "prod_kg", label: "2025 output (kg)", type: "decimal" }
    ],
    listColumns: ["farmer_id", "farmer_name", "sector", "plot_count", "area_ha"],
    profileFields: ["farmer_id", "farmer_name", "district", "sector", "cell", "plot_count", "area_ha", "prod_kg"]
  }
];

export function cloneSeed() { return JSON.parse(JSON.stringify([...SYSTEM_MODELS, ...SEED_MODELS])); }
