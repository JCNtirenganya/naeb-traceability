#!/usr/bin/env python3
"""
NAEB Coffee Traceability — alternative table setup script.

Creates the hosted feature tables for the NAEB Traceability system in the
"Trace" folder of the signed-in user's My Content, using the same model
definitions the browser app uses. This is a backup for when the in-browser
"Publish to portal" route hits permission or CORS problems.

Usage:
    pip install arcgis
    python scripts/create_tables.py --url https://gis.naeb.gov.rw/portal --user <username> --models models-export.json

Get models-export.json from the app: Admin -> Models -> "Export JSON".
If you omit --models, the built-in seed models from models_seed.json (next to
this script) are used.

The script is idempotent: it checks the folder for an existing service with the
same name and only adds missing fields.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

try:
    from arcgis.gis import GIS
    from arcgis.features import FeatureLayerCollection
except ImportError:
    print("This script needs the 'arcgis' package:  pip install arcgis", file=sys.stderr)
    sys.exit(1)

ESRI_TYPES = {
    "string": "esriFieldTypeString", "text": "esriFieldTypeString",
    "integer": "esriFieldTypeInteger", "decimal": "esriFieldTypeDouble",
    "date": "esriFieldTypeDate", "datetime": "esriFieldTypeDate",
    "boolean": "esriFieldTypeSmallInteger", "choice": "esriFieldTypeString",
    "multichoice": "esriFieldTypeString", "lookup": "esriFieldTypeString",
    "file": "esriFieldTypeString",
}
GEOMETRY = {"point": "esriGeometryPoint", "line": "esriGeometryPolyline", "polygon": "esriGeometryPolygon"}


def esri_field(f):
    t = ESRI_TYPES.get(f.get("type", "string"), "esriFieldTypeString")
    length = 2000 if f.get("type") == "text" else 255
    return {"name": f["name"].lower(), "type": t, "alias": f.get("label", f["name"]), "nullable": not f.get("required", False), "length": length}


def model_definition(model):
    fields = [{"name": "objectid", "type": "esriFieldTypeOID", "alias": "OBJECTID", "nullable": False}]
    fields += [esri_field(f) for f in model["fields"] if f["name"] != "objectid"]
    if not any(f["name"] == "globalid" for f in fields):
        fields.append({"name": "globalid", "type": "esriFieldTypeGlobalID", "alias": "globalid", "nullable": False, "length": 38})
    storage = model.get("storage", "table")
    defn = {
        "name": "0", "displayName": model.get("plural", model["name"]),
        "type": "Feature Layer" if storage != "table" else "Table",
        "geometryType": GEOMETRY.get(storage),
        "fields": fields, "hasAttachments": bool(model.get("attachments")),
        "objectIdField": "objectid", "globalIdField": "globalid",
        "capabilities": "Query,Create,Update,Delete,Editing", "maxRecordCount": 2000,
    }
    return {"layers": [defn]} if storage != "table" else {"tables": [defn]}


def ensure_folder(gis, folder):
    user = gis.users.me
    for f in user.folders:
        if f["title"] == folder:
            return f["id"]
    created = user.folders.create(folder)
    return created["id"]


def find_service(gis, name):
    for item in gis.content.search(query=f'title:"{name}"', item_type="Feature Service", max_items=50):
        if item.title == name:
            return item
    return None


def create_model(gis, folder_id, model):
    svc_name = "NAEB_Trace_" + "".join(c if c.isalnum() or c == "_" else "_" for c in model["id"])
    existing = find_service(gis, svc_name)
    storage = model.get("storage", "table")
    if existing:
        flc = FeatureLayerCollection.fromitem(existing)
        layer = flc.layers[0] if storage != "table" else flc.tables[0]
        current = {f["name"].lower() for f in layer.properties.fields}
        missing = [f for f in model["fields"] if f["name"].lower() not in current]
        if missing:
            add = {"fields": [esri_field(f) for f in missing]}
            layer.manager.add_to_definition({"fields": add["fields"]})
            print(f"  updated {svc_name}: added {len(missing)} field(s)")
        else:
            print(f"  exists {svc_name}: nothing to add")
        return existing.url + "/0"

    params = {
        "name": svc_name,
        "serviceDescription": f"{model.get('plural', model['name'])} — created by NAEB Traceability setup",
        "hasVersionedData": False, "supportsDisconnectedEditing": False,
        "syncEnabled": False, "maxRecordCount": 2000,
        "capabilities": "Query,Create,Update,Delete,Editing",
        "enableEditorTracking": True, "hasAttachments": bool(model.get("attachments")),
        "layers": [], "tables": [],
    }
    item = gis.content.create_service(svc_name, create_params=params, folder=folder_id)
    flc = FeatureLayerCollection.fromitem(item)
    flc.manager.add_to_definition(model_definition(model))
    print(f"  created {svc_name} -> {item.url}/0")
    return item.url + "/0"


def load_models(path):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "models" in data:
        return data["models"]
    return data


def main():
    ap = argparse.ArgumentParser(description="Create NAEB Traceability tables in ArcGIS Enterprise")
    ap.add_argument("--url", default="https://gis.naeb.gov.rw/portal", help="Portal URL")
    ap.add_argument("--user", required=True, help="Portal username")
    ap.add_argument("--password", default=os.environ.get("ARCGIS_PASSWORD"), help="Portal password (or set ARCGIS_PASSWORD)")
    ap.add_argument("--folder", default="Trace", help="Target folder (My Content)")
    ap.add_argument("--models", default=os.path.join(os.path.dirname(__file__), "models_seed.json"), help="Model definitions JSON")
    args = ap.parse_args()

    if not args.password:
        import getpass
        args.password = getpass.getpass("Portal password: ")

    print(f"Signing in to {args.url} as {args.user} …")
    gis = GIS(args.url, args.user, args.password)
    print(f"Signed in. Creating folder '{args.folder}' if needed.")
    folder_id = ensure_folder(gis, args.folder)

    models = load_models(args.models)
    targets = [m for m in models if m.get("kind") == "recordable"]
    if not targets:
        print("No recordable models found in", args.models)
        return
    print(f"Publishing {len(targets)} model(s) from {args.models}:")
    urls = {}
    for model in targets:
        print(f"- {model['id']} ({model.get('plural', model['name'])})")
        try:
            urls[model["id"]] = create_model(gis, folder_id, model)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: {exc}")

    print("\nLayer URLs (paste into the app's model editor):")
    for mid, url in urls.items():
        print(f"  {mid}: {url}")


if __name__ == "__main__":
    main()
