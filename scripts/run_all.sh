#!/usr/bin/env bash
# Full real-data pipeline, in dependency order. Needs `uv` and network access to ICGC, IGN,
# EMODnet, Catastro, Overpass and Wikimedia Commons. Outputs replace the sample data in public/.
set -euo pipefail
cd "$(dirname "$0")/.."
uv run scripts/fetch_raster.py          # raw/: DEM, bathymetry, orthophotos per era
uv run scripts/fetch_hires.py           # raw/: 0.5 m ortho of the inner box
uv run scripts/fetch_osm.py             # public/data/features.json
uv run scripts/export_terrain.py        # public/data/dem.bin, textures/ortho_*.webp, manifest
uv run scripts/process_buildings.py debug   # buildings.json, textures/urban_year.png, raw/debug_years_*.png
uv run scripts/coastline.py             # coastline.json, textures/shore.png
uv run scripts/make_landscape.py        # textures/landscape.webp, data/trees.bin
uv run scripts/gallery.py               # gallery/*.webp, data/gallery.json
echo "Now check raw/debug_years_*.png and redraw scripts/zones.json with grid_view.py if needed."
