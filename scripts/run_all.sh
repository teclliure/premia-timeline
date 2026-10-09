#!/usr/bin/env bash
# Full real-data pipeline, in dependency order. Needs `uv` and network access to ICGC, IGN,
# EMODnet, Catastro, Overpass and Wikimedia Commons. Outputs replace the sample data in public/.
# Optional steps (high-res ortho, gallery) only warn when they fail.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { echo; echo "=== $*"; }
optional() { "$@" || echo "WARNING: optional step failed: $*"; }
step fetch_raster;      uv run scripts/fetch_raster.py
step fetch_hires;       optional uv run scripts/fetch_hires.py
step fetch_osm;         uv run scripts/fetch_osm.py
step export_terrain;    uv run scripts/export_terrain.py
step process_buildings; uv run scripts/process_buildings.py debug
step coastline;         uv run scripts/coastline.py
step make_landscape;    uv run scripts/make_landscape.py
step gallery;           optional uv run scripts/gallery.py
echo "Done. Check raw/debug_years_*.png and draw scripts/zones.json with grid_view.py."
