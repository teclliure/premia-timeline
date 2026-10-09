"""Area of interest shared by every pipeline script.

Local coordinates used everywhere (scripts, JSON, the web app):
    x = metres east of the scene centre, y (called n in the app) = metres north of it.
The scene is a SIZE x SIZE square in ETRS89 / UTM 31N (EPSG:25831).

CENTER is set ~1 km inland of the beach at the Sant Cristòfol church, so the box runs from the
Premià de Dalt hills down to roughly 1 km out to sea. Check it with `grid_view.py` after the first
`fetch_raster.py` run and nudge it if needed (everything downstream reads it from raw/bbox.json).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
PUBLIC = ROOT / "public"
DATA = PUBLIC / "data"
TEX = PUBLIC / "textures"

CRS = "EPSG:25831"
# lat, lon of the scene centre (Premià de Mar, inland of the old seafront core).
CENTER_LL = (41.4955, 2.3575)
SIZE = 4000  # metres, outer box
DEM_CELL = 5  # metres per DEM sample in the exported dem.bin
# Inner high-resolution box (local metres): historic centre, seafront and railway.
INNER = {"x0": -800, "y0": -1000, "x1": 1200, "y1": 500}

# Orthophoto eras. `year` is the flight's reference year used by the shader blend.
# `candidates` are (WMS endpoint, layer names) tried in order: an exact layer name is requested
# directly; if the server does not return an image, the names are also looked up as substrings
# in GetCapabilities. ICGC (documented at icgc.cat, "WMS Territorial Orthophoto") comes first.
ICGC_ORTO = "https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms"
IGN_HIST = "https://www.ign.es/wms/pnoa-historico"
ERAS = {
    "1946": {"year": 1946, "px": 2048, "candidates": [
        (ICGC_ORTO, ["ortofoto_blanc_i_negre_1945-1946"]),
        (IGN_HIST, ["AMS_1945", "1945-1946", "SerieA"]),
    ]},
    "1956": {"year": 1956, "px": 2048, "candidates": [
        (ICGC_ORTO, ["ortofoto_blanc_i_negre_1956-1957"]),
        (IGN_HIST, ["AMS_1956-1957"]),
    ]},
    "1980": {"year": 1980, "px": 2048, "candidates": [
        (ICGC_ORTO, ["ortofoto_blanc_i_negre_1983-1989", "ortofoto_blanc_i_negre_1970-1977"]),
        (IGN_HIST, ["Interministerial_1973-1986"]),
    ]},
    "1995": {"year": 1995, "px": 2048, "candidates": [
        (ICGC_ORTO, ["ortofoto_blanc_i_negre_1994-1997", "ortofoto_color_1993"]),
        (IGN_HIST, ["OLISTAT", "1997"]),
    ]},
    "2004": {"year": 2004, "px": 4096, "candidates": [
        (ICGC_ORTO, ["ortofoto_color_2004-2005"]),
        (IGN_HIST, ["PNOA2004"]),
    ]},
    "now": {"year": 2024, "px": 4096, "candidates": [
        (ICGC_ORTO, ["ortofoto_color_vigent"]),
        ("https://www.ign.es/wms-inspire/pnoa-ma", ["OI.OrthoimageCoverage"]),
    ]},
}

# Catastro INSPIRE municipalities that intersect the box (names as in the ATOM feed).
CATASTRO_MUNICIPALITIES = ["PREMIA DE MAR", "PREMIA DE DALT", "VILASSAR DE MAR", "MASNOU", "TEIA"]


def centre_utm() -> tuple[int, int]:
    from pyproj import Transformer

    t = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    x, y = t.transform(CENTER_LL[1], CENTER_LL[0])
    return round(x), round(y)


def bbox() -> dict:
    """Read raw/bbox.json, creating it from CENTER_LL on first use."""
    path = RAW / "bbox.json"
    if path.exists():
        return json.loads(path.read_text())
    RAW.mkdir(exist_ok=True)
    cx, cy = centre_utm()
    h = SIZE // 2
    b = {"cx": cx, "cy": cy, "size": SIZE, "crs": CRS, "bbox": [cx - h, cy - h, cx + h, cy + h], "inner": INNER}
    path.write_text(json.dumps(b, indent=1))
    return b


def to_local(b: dict, x: float, y: float) -> tuple[float, float]:
    return x - b["cx"], y - b["cy"]
