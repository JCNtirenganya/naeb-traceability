# Rwanda Coffee · EUDR Traceability (NAEB)

A self-contained, static web app for tracing Rwandan coffee from plot to export, built
for NAEB to support EU Deforestation Regulation (EUDR) due-diligence. It runs entirely in
the browser as ES modules — **no build step** — and reads/writes NAEB's ArcGIS Enterprise
portal. It can be published on any static host (e.g. GitHub Pages).

> Risk flags are a **pre-screening aid, not a legal EUDR determination**. Never commit
> farmer PII to this repository.

---

## What it does

- **Map** — live washing-station points (public) and farm polygons (after sign-in), coloured
  by EUDR status, planting year, area or district, with a mapped-date timeline.
- **Network graph** — the whole chain as connected columns: farmers → washing stations →
  lots → export batches → exporters → importers.
- **Registry** — browse and search every entity; each has a profile page showing its full
  traced chain, quantities, risk and provenance.
- **Tracing** — selecting any record highlights everything upstream and downstream of it
  (farmers and plots feeding a batch, and where a farmer's cherries ended up).
- **Forms** — record cherry deliveries, lots, batches and custom models; a form builder
  lets admins design surveys and export them as **XLSForm** for field data collection.
- **Reports** — print/PDF profile or scope report, and CSV export of the current scope.
- **Admin** — build and edit any data model (fields, types, lookups), and publish hosted
  tables to the portal.
- **Languages** — English (default), French and Kinyarwanda, switchable at runtime.

---

## Data provenance (the core idea)

Every record carries a **data source**, shown as a coloured badge everywhere it appears:

| Badge | Meaning |
|-------|---------|
| **live** | Read directly from existing NAEB GIS layers (washing stations, farm polygons). Read-only. |
| **recorded** | Entered in this app and stored in an ArcGIS hosted table in the portal. |
| **indicative** | Demo/synthetic data, or a link inferred rather than recorded. |

A chain that contains any **indicative** link is presented as indicative. This keeps
demonstration data clearly separated from real records at all times.

Per model, the storage is resolved automatically:
- model has a **layer URL** → reads/writes the real hosted table (`recorded`);
- model has **no URL** → uses a deterministic demo suite (`indicative`) plus any rows you
  add in the current session, so the app is fully explorable before any portal setup.

---

## Running locally

```powershell
python -m http.server 8080
# then open http://localhost:8080
```

The app works without signing in: washing stations load live and the committed demo suite
makes every screen explorable. Sign in with your NAEB portal account to load farm polygons
and to record data.

---

## Connecting to ArcGIS Enterprise

Configuration lives in [`src/config.js`](src/config.js): portal URL, the washing-station
layer URL, the farms portal item id, the `Trace` folder name and the registry item titles.

**Sign-in** uses the portal's `generateToken` endpoint with `client=referer`, so credentials
go straight to `gis.naeb.gov.rw` and are never stored by the app (only the returned token,
kept in `sessionStorage`).

### Creating the hosted tables

Two equivalent routes:

1. **In-app** — *Admin → Models →* open a model → **Publish to portal**. This creates a
   hosted feature table named `NAEB_Trace_<model>` in the **Trace** folder and links it to
   the model. Re-publishing only adds missing fields.
2. **Python (alternative)** — if the browser route hits permissions or CORS:

   ```powershell
   pip install arcgis
   python scripts/create_tables.py --user <portal-user> --models models-export.json
   ```

   Get `models-export.json` from *Admin → Models → Export JSON*, or use the bundled
   [`scripts/models_seed.json`](scripts/models_seed.json). The script is idempotent and
   prints each layer URL, which you paste back into the model editor.

### Editing models

Admins can change anything in *Admin → Models*: add/remove fields, set types, mark fields
required/unique, define choice lists and lookups to other models, and choose the title and
list columns. Use **Save registry to portal** to persist model definitions as a JSON item
so they are shared between users.

### Survey forms / XLSForm

*Admin → Forms* builds surveys (questions, types, required, skip logic and simple
calculations). Forms are stored in the portal registry item and exportable as **XLSForm**
(`.xlsx`) for KoBoToolbox/ODK/SurveyCTO field collection.

---

## Repository layout

```
index.html            app shell
src/
  config.js           portal, layer and folder configuration
  main.js             bootstrap, router, global selection
  style.css           design system (light/dark, print)
  core/               store, i18n, auth, router
  data/               model registry, ArcGIS adapter, demo data, chain/scope logic, forms
  ui/                 shell, components, form generator, views/
  map/                Leaflet farm + station layers
  graph/              SVG network graph
  report/             print (PDF) and CSV
  admin/              XLSForm export
scripts/
  create_tables.py    Python alternative for creating hosted tables
  models_seed.json    default model definitions
```

---

## Deploying to GitHub Pages

The app is static. Copy `index.html`, `src/` and (optionally) `scripts/` to a repository and
enable Pages for the branch/root. Because everything is relative and there is no build step,
it serves as-is.

**CORS**: the portal must allow the deployed origin to call it. If sign-in or layer reads
fail with a network/CORS error, ask the GIS admin to add your site's origin to the portal's
allowed origins (`client=referer` flow).

---

## Assumptions and limitations

- Washing stations are read from the public `Coffee_Washing_Station` layer; farms come from
  the private item `63a787f80563400fa9e46af7f006d714` and require sign-in.
- Editor tracking is assumed available on hosted tables (e.g. `CreationDate`), used for the
  mapped-date timeline.
- Data access is abstracted behind `src/data/registry.js`; swapping the storage backend only
  touches that module.
- Online only, signed-in required for farm data and all writes.
- Risk screening is a heuristic pre-screen (overlap flag, planting year, prior land use) and
  is **not** a legal EUDR determination.
