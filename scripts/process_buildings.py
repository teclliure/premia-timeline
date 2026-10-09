# /// script
# dependencies = ["requests", "lxml", "numpy", "pillow", "scipy"]
# ///
"""Catastro INSPIRE buildings -> public/data/buildings.json (+ textures/urban_year.png).

    uv run scripts/process_buildings.py           # download (cached in raw/bu/) and process
    uv run scripts/process_buildings.py debug     # also write raw/debug_years_<era>.png

Year rule (shown in the app's notes):
  * Catastro has no years before ~1900 and often stores the year of the last major renovation.
  * Inside the hand-drawn historic zones of scripts/zones.json the year is an estimate: it grows
    outwards from the zone's seed point between the zone's `from` and `to`, and is never later
    than the Catastro year.
  * Outside the zones the Catastro year is used as is.
  * OVERRIDES pins buildings with a documented date.

buildings.json: {"origin": {...}, "parts": [[year, floors, base_dm, rings, use, zone, catastro_year], ...]}
rings are flat [x0, y0, x1, y1, ...] lists in local decimetres; the first ring is the outline.
"""
import io
import json
import math
import re
import sys
import zipfile

import numpy as np
import requests
from lxml import etree
from PIL import Image, ImageDraw
from scipy import ndimage

import aoi

NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "bu-core2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0",
    "bu-ext2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0",
}
ATOM = "https://www.catastro.hacienda.gob.es/INSPIRE/buildings/08/ES.SDGC.bu.atom_08.xml"
B = aoi.bbox()
CX, CY, SIZE = B["cx"], B["cy"], B["size"]
HALF = SIZE / 2
DEM = np.fromfile(aoi.DATA / "dem.bin", dtype="<i2").astype(np.float32) / 10
N = int(math.isqrt(DEM.size))
DEM = DEM.reshape(N, N)
CELL = SIZE / N

# Buildings with a documented date: (local centre x, y), radius m, year, source.
# Positions are filled in after looking at grid_view.py output; the years are sourced.
OVERRIDES: list[tuple[tuple[float, float], float, int, str]] = [
    # ((x, y), 40, 1898, "Fàbrica Lió / Can Puiggròs, c. Joan Prim 30 — Inventari Patrimoni Cultural DIBA"),
]


def download() -> list[tuple[str, bytes, bytes]]:
    """(municipality, building.gml, buildingpart.gml) for every municipality in the box."""
    cache = aoi.RAW / "bu"
    cache.mkdir(parents=True, exist_ok=True)
    UA = {"User-Agent": "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)"}
    feed = etree.fromstring(requests.get(ATOM, timeout=120, headers=UA).content)
    out = []
    for entry in feed.iter("{*}entry"):
        title = (entry.findtext("{*}title") or "").upper()
        if not any(m in title for m in aoi.CATASTRO_MUNICIPALITIES):
            continue
        href = next((l.get("href") for l in entry.iter("{*}link") if (l.get("href") or "").lower().endswith(".zip")), None)
        if not href:
            continue
        name = re.sub(r"\W+", "_", title).strip("_")
        zpath = cache / f"{name}.zip"
        if not zpath.exists():
            print("download", title, href)
            zpath.write_bytes(requests.get(href, timeout=600, headers=UA).content)
        z = zipfile.ZipFile(zpath)
        bfile = next(n for n in z.namelist() if n.endswith(".building.gml"))
        pfile = next(n for n in z.namelist() if n.endswith(".buildingpart.gml"))
        out.append((title, z.read(bfile), z.read(pfile)))
    if not out:
        raise SystemExit(f"no municipality from {aoi.CATASTRO_MUNICIPALITIES} in {ATOM}")
    return out


def dem_at(x: float, y: float) -> float:
    c = min(max((x + HALF) / CELL - 0.5, 0), N - 1.001)
    r = min(max((HALF - y) / CELL - 0.5, 0), N - 1.001)
    c0, r0 = int(c), int(r)
    fc, fr = c - c0, r - r0
    a = DEM[r0, c0] * (1 - fc) + DEM[r0, c0 + 1] * fc
    b = DEM[r0 + 1, c0] * (1 - fc) + DEM[r0 + 1, c0 + 1] * fc
    return float(a * (1 - fr) + b * fr)


def rings(el) -> list[list[tuple[float, float]]]:
    for patch in el.iterfind(".//gml:PolygonPatch", NS):
        out = []
        for pl in patch.iterfind(".//gml:posList", NS):
            v = [float(t) for t in pl.text.split()]
            out.append([(round(v[i] - CX, 2), round(v[i + 1] - CY, 2)) for i in range(0, len(v), 2)])
        return out
    return []


def year_of(el) -> int | None:
    e = el.find(".//bu-core2d:dateOfConstruction//bu-core2d:end", NS)
    if e is None or not e.text or not e.text[:4].isdigit():
        return None
    return int(e.text[:4])


def point_in_poly(x: float, y: float, poly) -> bool:
    inside, j = False, len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


ZONES = json.loads((aoi.ROOT / "scripts/zones.json").read_text())
if not ZONES:
    print("WARNING: scripts/zones.json is empty: every building uses its Catastro year (none before ~1900). Draw the historic zones with grid_view.py.")


def hash01(s: str) -> float:
    h = 2166136261
    for ch in s.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h / 0xFFFFFFFF


def estimate_year(bid: str, catastro: int | None, x: float, y: float) -> tuple[int, str]:
    cat = catastro or 1960
    for z in ZONES:
        if point_in_poly(x, y, z["poly"]):
            d = math.hypot(x - z["seed"][0], y - z["seed"][1])
            t = min(d / z["radius"], 1.0) ** z.get("power", 1.0)
            yr = z["from"] + (z["to"] - z["from"]) * t + (hash01(bid) - 0.5) * z.get("jitter", 0)
            return int(round(min(yr, cat))), z["id"]
    return cat, "-"


def main() -> None:
    parts = []
    for muni, bgml, pgml in download():
        bld = {}
        for _, el in etree.iterparse(io.BytesIO(bgml), tag="{%s}Building" % NS["bu-ext2d"]):
            bid = el.get("{%s}id" % NS["gml"]).split(".")[-1]
            bld[bid] = {"year": year_of(el), "use": el.findtext("bu-ext2d:currentUse", namespaces=NS) or ""}
            el.clear()
        n0 = len(parts)
        for _, el in etree.iterparse(io.BytesIO(pgml), tag="{%s}BuildingPart" % NS["bu-ext2d"]):
            pid = el.get("{%s}id" % NS["gml"]).split(".")[-1]
            bid = pid.split("_part")[0]
            fl = el.findtext("bu-ext2d:numberOfFloorsAboveGround", namespaces=NS)
            floors = int(fl) if fl and fl.isdigit() else 0
            rr = rings(el)
            el.clear()
            if floors <= 0 or not rr:
                continue
            xs = [p[0] for p in rr[0]]
            ys = [p[1] for p in rr[0]]
            if min(xs) < -HALF + 5 or max(xs) > HALF - 5 or min(ys) < -HALF + 5 or max(ys) > HALF - 5:
                continue
            b = bld.get(bid, {"year": None, "use": ""})
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            yr, zone = estimate_year(bid, b["year"], cx, cy)
            for (ox, oy), r, oyear, _src in OVERRIDES:
                if math.hypot(cx - ox, cy - oy) < r:
                    yr = oyear
            base = min(dem_at(px, py) for px, py in rr[0])
            parts.append({"y": yr, "cy": b["year"], "z": zone, "f": floors, "base": base, "rings": rr, "use": b["use"][:1]})
        print(muni, len(parts) - n0, "parts")

    parts.sort(key=lambda p: p["y"])  # the app draws a prefix of the mesh: sorted by year
    out = {
        "origin": {"x": CX, "y": CY, "size": SIZE},
        "parts": [[p["y"], p["f"], round(p["base"] * 10),
                   [[v for pt in ring[:-1] for v in (round(pt[0] * 10), round(pt[1] * 10))] for ring in p["rings"]],
                   p["use"], p["z"], p["cy"] or 0] for p in parts],
    }
    aoi.DATA.mkdir(parents=True, exist_ok=True)
    (aoi.DATA / "buildings.json").write_text(json.dumps(out, separators=(",", ":")))
    print("parts", len(parts), "bytes", (aoi.DATA / "buildings.json").stat().st_size)
    write_urban_year(parts)
    if "debug" in sys.argv:
        debug(parts)


def year_byte(y: float) -> int:
    """urban_year.png encoding shared with the shader: 1700..2030 -> 1..254, 0 = before 1700, 255 = never."""
    return int(np.clip(round(1 + (y - 1700) / 330 * 253), 0, 254)) if y >= 1700 else 0


def write_urban_year(parts) -> None:
    """Earliest year anything was built at each texel, dilated over the streets around it. The
    terrain shader shows the era photo where this year has passed and the pre-urban landscape
    (make_landscape.py) elsewhere."""
    px = 2048
    s = px / SIZE
    img = np.full((px, px), 255, np.uint8)
    for p in sorted(parts, key=lambda p: -p["y"]):  # earliest drawn last, so it wins
        layer = Image.new("L", (px, px), 0)
        ImageDraw.Draw(layer).polygon([((x + HALF) * s, (HALF - y) * s) for x, y in p["rings"][0]], fill=1)
        img[np.asarray(layer) > 0] = year_byte(p["y"])
    img = ndimage.grey_erosion(img, size=(7, 7))  # spread the earliest year ~7 m into the streets
    aoi.TEX.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(aoi.TEX / "urban_year.png", optimize=True)


def debug(parts) -> None:
    for era in ("1946", "1956", "now"):
        p = aoi.RAW / f"ortho_{era}.jpg"
        if not p.exists():
            continue
        img = Image.open(p).convert("RGB").resize((2000, 2000))
        dr = ImageDraw.Draw(img, "RGBA")
        s = 2000 / SIZE
        for q in parts:
            y = q["y"]
            col = (255, 0, 0, 150) if y < 1850 else (255, 160, 0, 150) if y < 1900 else (255, 255, 0, 140) if y < 1946 else (0, 220, 0, 110) if y < 1980 else (0, 120, 255, 90)
            dr.polygon([((x + HALF) * s, (HALF - yy) * s) for x, yy in q["rings"][0]], fill=col)
        for z in ZONES:
            pts = [((x + HALF) * s, (HALF - y) * s) for x, y in z["poly"]]
            dr.line(pts + [pts[0]], fill=(255, 0, 255, 255), width=3)
        img.save(aoi.RAW / f"debug_years_{era}.png")


if __name__ == "__main__":
    main()
