#!/usr/bin/env bash
# Full real-data pipeline, in dependency order. Needs `uv` and network access to ICGC, IGN,
# EMODnet, Catastro, Overpass and Wikimedia Commons. Outputs replace the sample data in public/.
# Optional steps (high-res ortho, gallery) only warn when they fail.
set -euo pipefail
cd "$(dirname "$0")/.."
# ONLY="fetch_osm gallery" runs just those steps (the rest of the data must already be in place).
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
step() { echo; echo "=== $*"; }
optional() { "$@" || echo "WARNING: optional step failed: $*"; }
want fetch_raster && { step fetch_raster;      uv run scripts/fetch_raster.py; }
want fetch_hires && { step fetch_hires;       optional uv run scripts/fetch_hires.py; }
want fetch_osm && { step fetch_osm;         uv run scripts/fetch_osm.py; }
want export_terrain && { step export_terrain;    uv run scripts/export_terrain.py; }
want process_buildings && { step process_buildings; uv run scripts/process_buildings.py debug; }
want coastline && { step coastline;         uv run scripts/coastline.py; }
want make_landscape && { step make_landscape;    uv run scripts/make_landscape.py; }
want gallery && { step gallery;           optional uv run scripts/gallery.py; }
echo "Done. Check raw/debug_years_*.png and draw scripts/zones.json with grid_view.py."
