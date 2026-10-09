# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Synthetic sample data so the viewer can be developed and tested without the real datasets.

    uv run scripts/make_placeholder.py

Writes every file the app reads (public/data/*, public/textures/*) in exactly the formats the
real pipeline produces, with manifest.json {"placeholder": true} so the app shows a
"Dades de mostra" banner. The layout imitates Premià de Mar only roughly: a straight coast
trending N55°E, the town between the beach and the C-32, Premià de Dalt on the hills. Nothing
here is measured. Running the real pipeline overwrites all of it.
"""
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

import aoi

SIZE = aoi.SIZE
HALF = SIZE / 2
N = SIZE // aoi.DEM_CELL
TH = math.radians(35)  # coast direction, degrees north of east
U = np.array([math.cos(TH), math.sin(TH)])  # along-shore (towards NE)
NRM = np.array([math.sin(TH), -math.cos(TH)])  # offshore (towards SE)
SHORE = 1000.0  # the shoreline is this far offshore of the scene centre
RIERES = [(-1150, 30), (230, 26), (1400, 30)]  # (along-shore position, half width) of stream beds
rng = np.random.default_rng(1848)


def to_xy(s, d):
    """(along-shore s, offshore d) -> local x, y. d < 0 is land."""
    return s * U[0] + (d + SHORE) * NRM[0], s * U[1] + (d + SHORE) * NRM[1]


def to_sd(x, y):
    return x * U[0] + y * U[1], x * NRM[0] + y * NRM[1] - SHORE


def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def shore_wiggle(s):
    return 12 * np.sin(s / 330) + 6 * np.sin(s / 97 + 1)


# ---------------------------------------------------------------- terrain

def terrain() -> np.ndarray:
    cell = SIZE / N
    yy, xx = np.mgrid[0:N, 0:N]
    x = (xx + 0.5) * cell - HALF
    y = HALF - (yy + 0.5) * cell
    s, d = to_sd(x, y)
    d = d - shore_wiggle(s)
    inland = -d
    noise = ndimage.gaussian_filter(rng.normal(0, 1, (N, N)), 18) * 60
    land = 0.8 + inland * 0.021 + 150 * sstep(1300, 3900, inland) ** 1.3 + noise * sstep(900, 3000, inland)
    beach = 0.25 + inland * 0.035
    land = np.where(inland < 70, beach, np.maximum(land, beach))
    for s0, w in RIERES:
        wid = w + np.maximum(inland, 0) * 0.02
        depth = (1.2 + np.maximum(inland, 0) * 0.012) * np.exp(-((s - s0) / wid) ** 2)
        land -= depth * sstep(20, 200, inland)
    bar = 0.6 * np.exp(-((d - 140) / 40) ** 2)
    seabed = -0.4 - 0.017 * d + bar - 0.5 * sstep(0, 60, d)
    h = np.where(d < 0, land, seabed)
    return ndimage.gaussian_filter(h, 0.8).astype(np.float32)


# ---------------------------------------------------------------- buildings

ZONES = []


def zone(zid, name, s0, s1, d0, d1, seed, yfrom, yto, jitter, note):
    poly = [list(map(lambda v: round(float(v), 1), to_xy(s, d))) for s, d in ((s0, d0), (s1, d0), (s1, d1), (s0, d1))]
    sx, sy = to_xy(*seed)
    ZONES.append({"id": zid, "name": name, "poly": poly, "seed": [round(float(sx), 1), round(float(sy), 1)],
                  "radius": float(max(s1 - s0, d1 - d0) * 0.7), "from": yfrom, "to": yto, "power": 1.0,
                  "jitter": jitter, "note": note})


NOTE = ("ESBORRANY generat per make_placeholder.py: redibuixeu aquest polígon sobre la foto de 1946/1956 "
        "amb grid_view.py abans de fer servir dades reals.")
CHURCH_SD = (0.0, -330.0)
zone("nucli_mar", "Nucli mariner antic (entorn de Sant Cristòfol)", -380, 380, -470, -110, CHURCH_SD, 1800, 1880, 25, NOTE)
zone("eixample_xix", "Quadrícula del segle XIX", -950, 950, -900, -110, CHURCH_SD, 1840, 1935, 30, NOTE)
zone("nucli_dalt", "Nucli antic de Premià de Dalt", -450, 300, -3050, -2500, (-100, -2750), 1650, 1900, 60, NOTE)


def in_zone(z, x, y):
    poly = z["poly"]
    inside, j = False, len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def rect(s, d, ls, ld):
    """Footprint ring (local x, y) of a rectangle aligned to the coast."""
    return [tuple(map(float, to_xy(s + a, d + b))) for a, b in ((0, 0), (ls, 0), (ls, -ld), (0, -ld), (0, 0))]


def near_riera(s, pad=0):
    return any(abs(s - s0) < w + pad for s0, w in RIERES)


def buildings(dem: np.ndarray):
    parts = []
    church_s, church_d = CHURCH_SD

    def add(s, d, ls, ld, floors, year, cat, zid):
        ring = rect(s, d, ls, ld)
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        if min(xs) < -HALF + 5 or max(xs) > HALF - 5 or min(ys) < -HALF + 5 or max(ys) > HALF - 5:
            return
        cells = [dem[int(np.clip((HALF - y) / SIZE * N, 0, N - 1)), int(np.clip((x + HALF) / SIZE * N, 0, N - 1))] for x, y in ring]
        parts.append({"y": int(year), "f": int(floors), "base": float(min(cells)), "ring": ring, "z": zid, "cy": int(cat)})

    def town_block(bs, bd, bl, bdp):
        """One street block: a ring of row houses, or a few apartment slabs."""
        cs, cd = bs + bl / 2, bd - bdp / 2
        x, y = to_xy(cs, cd)
        z = next((z for z in ZONES if in_zone(z, x, y)), None)
        dist = math.hypot(cs - church_s, cd - church_d)
        if z:
            t = min(dist / z["radius"], 1.0)
            base_year = z["from"] + (z["to"] - z["from"]) * t
        elif cd > -2000:
            base_year = 1956 + min(dist / 1700, 1) * 30 + rng.normal(0, 6)
        else:
            base_year = 1965 + rng.uniform(0, 45)
        old = base_year < 1940
        if not old and cd > -2000 and rng.random() < 0.6:
            # Apartment slabs of the 1960s-80s boom.
            n = rng.integers(2, 4)
            for k in range(n):
                ls = bl / n - 4
                floors = int(rng.integers(4, 8))
                yr = base_year + rng.normal(0, 4)
                add(bs + k * bl / n + 2, bd - 4, ls, 14, floors, yr, yr, "-")
                add(bs + k * bl / n + 2, bd - bdp + 18, ls, 14, floors, yr + rng.normal(0, 3), yr, "-")
            return
        if not old and cd <= -2000:
            # Detached houses on the hills.
            for k in range(int(rng.integers(1, 4))):
                yr = base_year + rng.normal(0, 5)
                add(bs + 6 + k * bl / 3, bd - 10 - rng.uniform(0, 30), 11, 10, int(rng.integers(1, 3)), yr, yr, "-")
            return
        # Row houses along both long sides of the block.
        for side_d, depth in ((bd, 16), (bd - bdp + 16, 16)):
            p = bs
            while p < bs + bl - 5:
                w = float(rng.uniform(6, 10))
                w = min(w, bs + bl - p)
                jitter = (rng.random() - 0.5) * (z["jitter"] if z else 8)
                yr = base_year + jitter
                cat = yr if yr > 1900 and rng.random() < 0.6 else rng.choice([1940, 1955, 1968, 1975, 1984])
                cat = max(cat, 1900)
                yr_est = min(yr, cat)
                floors = int(rng.choice([1, 2, 2, 3])) if yr_est < 1900 else int(rng.choice([2, 3, 3, 4]))
                add(p, side_d, w - 0.3, depth, floors, yr_est, cat, z["id"] if z else "-")
                p += w

    # Premià de Mar: blocks between the coastal strip and the C-32.
    bl, bdp, st = 86, 64, 12
    s = -1900.0
    while s < 1900:
        d = -120.0
        while d > -1680:
            if not near_riera(s + bl / 2, 30) and not (abs(s + bl / 2 - church_s) < 60 and abs(d - bdp / 2 - church_d) < 50):
                if rng.random() < 0.94:
                    town_block(s, d, bl, bdp)
            d -= bdp + st
        s += bl + st
    # Premià de Dalt and the hillside.
    s = -1200.0
    while s < 1000:
        d = -2300.0
        while d > -3300:
            if not near_riera(s + bl / 2, 30) and rng.random() < 0.55:
                town_block(s, d, bl, bdp)
            d -= bdp + st + 20
        s += bl + st + 10
    parts.sort(key=lambda p: p["y"])
    return parts


# ---------------------------------------------------------------- features

def line_sd(d, s0=-2900, s1=2900, step=40, wiggle=0.0):
    pts = []
    for s in np.arange(s0, s1 + 1, step):
        x, y = to_xy(s, d + wiggle * math.sin(s / 300))
        if -HALF <= x <= HALF and -HALF <= y <= HALF:
            pts.append([round(float(x), 1), round(float(y), 1)])
    return pts


def features():
    def pt(s, d):
        x, y = to_xy(s, d)
        return [round(float(x), 1), round(float(y), 1)]

    port = [[pt(-1080, -20), pt(-1080, 330), pt(-600, 330), pt(-520, 260)],
            [pt(-640, -20), pt(-640, 150), pt(-760, 210)]]
    return {
        "lines": {
            "railway": [line_sd(-38)],
            "n2": [line_sd(-88, wiggle=4)],
            "c32": [line_sd(-1750, wiggle=25)],
            "streets": [],
            "breakwater": port,
        },
        "areas": {"beach": [], "harbour": [[pt(-1080, -20), pt(-1080, 330), pt(-600, 330), pt(-640, -20)]]},
        "pois": {
            "church": pt(*CHURCH_SD), "church_dalt": pt(-100, -2760), "museu_roma": pt(620, -720),
            "museu_estampacio": pt(260, -500), "fabrica_lio": pt(-260, -620), "vallpremia": pt(950, -1150),
            "frigorifics": pt(-380, -260), "station": pt(80, -45),
        },
        "chimneys": [pt(-262, -628), pt(520, -380), pt(-600, -900)],
        "attribution": "Dades de mostra (no són d'OpenStreetMap)",
        "placeholder": True,
    }


# ---------------------------------------------------------------- coastline

SEG = 16


def coastline():
    """Illustrative shoreline offsets (m, + = beach wider than today) for 16 segments, SW -> NE.
    The port sits around segment 4; longshore drift on the Maresme coast runs towards the SW, so
    the sketch shows sand piling up NE of the port and loss on its SW side after 1974."""
    k = np.arange(SEG)
    ne = (k > 4).astype(float)
    sw = (k < 4).astype(float)
    keys = [
        {"year": 1848, "offsets": [18.0] * SEG, "kind": "illustrative"},
        {"year": 1946, "offsets": [10.0] * SEG, "kind": "illustrative"},
        {"year": 1972, "offsets": [5.0] * SEG, "kind": "illustrative"},
        {"year": 1980, "offsets": list(np.round(5 - 10 * ne * np.exp(-(k - 5) / 4) + 8 * sw, 1)), "kind": "illustrative"},
        {"year": 2004, "offsets": list(np.round(2 - 4 * ne * np.exp(-(k - 5) / 4) + 4 * sw, 1)), "kind": "illustrative"},
        {"year": 2026, "offsets": [0.0] * SEG, "kind": "measured"},
    ]
    a0, a1 = -2600.0, 2600.0
    ox, oy = to_xy(0, 0)
    return {"segments": SEG, "band": 250.0, "axis": [float(U[0]), float(U[1])], "origin": [float(ox), float(oy)],
            "range": [a0, a1], "keys": [{**k_, "offsets": [float(v) for v in k_["offsets"]]} for k_ in keys],
            "placeholder": True}


def shore_png(dem: np.ndarray, coast) -> None:
    sea = dem <= 0
    cell = SIZE / N
    signed = np.where(sea, ndimage.distance_transform_edt(sea), -ndimage.distance_transform_edt(~sea)) * cell
    yy, xx = np.mgrid[0:N, 0:N]
    x = (xx + 0.5) * cell - HALF
    y = HALF - (yy + 0.5) * cell
    along = (x - coast["origin"][0]) * U[0] + (y - coast["origin"][1]) * U[1]
    a0, a1 = coast["range"]
    band = np.abs(signed) < coast["band"]
    r = np.clip(127 + signed / 2, 0, 255).astype(np.uint8)
    g = np.where(band, np.clip((along - a0) / (a1 - a0) * 255, 1, 255), 0).astype(np.uint8)
    Image.fromarray(np.stack([r, g, np.zeros_like(r)], -1)).resize((1024, 1024), Image.NEAREST).save(aoi.TEX / "shore.png")


# ---------------------------------------------------------------- orthophotos

def offsets_at(coast, year):
    keys = coast["keys"]
    if year <= keys[0]["year"]:
        return np.array(keys[0]["offsets"])
    for a, b in zip(keys, keys[1:]):
        if year <= b["year"]:
            t = (year - a["year"]) / (b["year"] - a["year"])
            return np.array(a["offsets"]) * (1 - t) + np.array(b["offsets"]) * t
    return np.zeros(SEG)


def render(year, parts, dem, coast, feats, px=2048, built=True, gray=False, fade=0.0):
    yy, xx = np.mgrid[0:px, 0:px]
    x = (xx + 0.5) / px * SIZE - HALF
    y = HALF - (yy + 0.5) / px * SIZE
    s, d = to_sd(x, y)
    h = ndimage.zoom(dem, px / N, order=1)[:px, :px]
    inland = -(d - shore_wiggle(s))
    # Fields: a patchwork aligned with the coast.
    fi = np.floor(s / 38).astype(np.int64) * 73856093 ^ np.floor(d / 24).astype(np.int64) * 19349663
    fh = (fi % 1000) / 1000.0
    field = np.stack([0.42 + 0.18 * fh, 0.45 + 0.12 * (1 - fh), 0.25 + 0.08 * fh], -1)
    rows = 0.94 + 0.06 * np.sin(s * 1.6)[..., None]
    field = field * rows
    forest = np.array([0.18, 0.27, 0.15]) * (0.85 + 0.3 * ndimage.gaussian_filter(rng.random((px, px)), 2))[..., None]
    wood = sstep(1600, 2400, inland)[..., None]
    img = field * (1 - wood) + forest * wood
    seg = np.clip(((s - coast["range"][0]) / (coast["range"][1] - coast["range"][0]) * SEG).astype(int), 0, SEG - 1)
    off = offsets_at(coast, year)[seg]
    sand = (h > -0.2 - off * 0.03) & (inland < 55 + off)
    img = np.where(sand[..., None], np.array([0.80, 0.74, 0.60]), img)
    water = h < -off * 0.03
    depth = np.clip(-h, 0, 25)
    sea = np.stack([0.10 + 0.25 * np.exp(-depth / 3), 0.22 + 0.30 * np.exp(-depth / 4), 0.36 + 0.2 * np.exp(-depth / 6)], -1)
    img = np.where(water[..., None], sea, img)
    for s0, w in RIERES:  # dry stream beds
        bed = (np.abs(s - s0) < 6 + np.maximum(inland, 0) * 0.004) & (inland > 0)
        img = np.where(bed[..., None], np.array([0.70, 0.66, 0.56]), img)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    k = px / SIZE

    def P(p):
        return ((p[0] + HALF) * k, (HALF - p[1]) * k)

    if built:
        for line in feats["lines"]["n2"]:
            dr.line([P(p) for p in line], fill=(150, 140, 120) if year < 1950 else (95, 95, 95), width=max(2, int(9 * k)))
        if year >= 1848:
            for line in feats["lines"]["railway"]:
                dr.line([P(p) for p in line], fill=(80, 70, 60), width=max(2, int(7 * k)))
        if year >= 1969:
            for line in feats["lines"]["c32"]:
                dr.line([P(p) for p in line], fill=(70, 70, 72), width=max(3, int(26 * k)))
        if year >= 1974:
            for line in feats["lines"]["breakwater"]:
                dr.line([P(p) for p in line], fill=(170, 165, 150), width=max(3, int(16 * k)))
        for p in parts:
            if p["y"] > year:
                continue
            ring = [P(q) for q in p["ring"]]
            cx = sum(q[0] for q in ring) / len(ring)
            cy = sum(q[1] for q in ring) / len(ring)
            street = [(cx + (q[0] - cx) * 1.5, cy + (q[1] - cy) * 1.5) for q in ring]
            dr.polygon(street, fill=(150, 142, 128))
        for p in parts:
            if p["y"] > year:
                continue
            old = p["y"] < 1930 and p["f"] <= 3
            hsh = (hash(round(p["ring"][0][0])) % 30) - 15
            col = (178 + hsh, 96 + hsh // 2, 70) if old else (205 + hsh, 200 + hsh, 190 + hsh)
            dr.polygon([P(q) for q in p["ring"]], fill=col)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(im).astype(np.float32)
    if gray:
        g = a @ np.array([0.3, 0.59, 0.11])
        g = g + rng.normal(0, 7, g.shape)
        g = (g - 128) * 1.15 + 128
        a = np.repeat(g[..., None], 3, -1)
    if fade:
        a = a * (1 - fade) + np.array([200, 190, 170]) * fade
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def year_byte(y):
    return int(np.clip(round(1 + (y - 1700) / 330 * 253), 0, 254)) if y >= 1700 else 0


def urban_year(parts):
    px = 2048
    k = px / SIZE
    img = np.full((px, px), 255, np.uint8)
    for p in sorted(parts, key=lambda p: -p["y"]):
        layer = Image.new("L", (px, px), 0)
        ImageDraw.Draw(layer).polygon([((x + HALF) * k, (HALF - y) * k) for x, y in p["ring"]], fill=1)
        img[np.asarray(layer) > 0] = year_byte(p["y"])
    img = ndimage.grey_erosion(img, size=(7, 7))
    Image.fromarray(img).save(aoi.TEX / "urban_year.png", optimize=True)
    return img


# ---------------------------------------------------------------- trees

def trees(dem, uy):
    out = []
    px = uy.shape[0]

    def ground(x, y):
        return float(dem[int(np.clip((HALF - y) / SIZE * N, 0, N - 1)), int(np.clip((x + HALF) / SIZE * N, 0, N - 1))])

    def uyear(x, y):
        b = uy[int(np.clip((HALF - y) / SIZE * px, 0, px - 1)), int(np.clip((x + HALF) / SIZE * px, 0, px - 1))]
        return 9999 if b == 255 else 1600 if b == 0 else 1700 + (b - 1) / 253 * 330

    for _ in range(90000):
        x, y = rng.uniform(-HALF, HALF, 2)
        s, d = to_sd(x, y)
        inland = -d
        z = ground(x, y)
        if z < 1.5:
            continue
        u = uyear(x, y)
        if inland > 1500 and rng.random() < sstep(1500, 2600, inland):
            if u < 9999:
                continue
            out.append([x, y, z, float(rng.uniform(6, 13)), 0, -9000, 9999])  # pines / holm oaks
        elif inland > 120 and rng.random() < 0.5:
            if u <= 1800:
                continue
            if rng.random() < 0.5:
                out.append([x, y, z, 0.9, 2, -100, min(1890, u)])
            else:
                out.append([x, y, z, float(rng.uniform(3, 5)), 1, 1890, u])
    return out


def main() -> None:
    for p in (aoi.DATA, aoi.TEX):
        p.mkdir(parents=True, exist_ok=True)
    dem = terrain()
    (np.round(dem * 10).astype("<i2")).tofile(aoi.DATA / "dem.bin")
    (aoi.DATA / "dem.json").write_text(json.dumps({"cx": 0, "cy": 0, "size": SIZE, "rows": N, "cols": N, "crs": aoi.CRS,
                                                   "min": float(dem.min()), "max": float(dem.max()), "source": "placeholder"}))
    print("dem", dem.shape, float(dem.min()), float(dem.max()))

    zpath = aoi.ROOT / "scripts/zones.json"
    if not zpath.exists():  # never overwrite zones drawn by hand
        zpath.write_text(json.dumps(ZONES, ensure_ascii=False, indent=1))
    parts = buildings(dem)
    out = {"origin": {"x": 0, "y": 0, "size": SIZE}, "placeholder": True,
           "parts": [[p["y"], p["f"], round(p["base"] * 10),
                      [[v for pt in p["ring"][:-1] for v in (round(pt[0] * 10), round(pt[1] * 10))]], "1" if p["f"] < 3 else "",
                      p["z"], p["cy"]] for p in parts]}
    (aoi.DATA / "buildings.json").write_text(json.dumps(out, separators=(",", ":")))
    print("buildings", len(parts))

    feats = features()
    (aoi.DATA / "features.json").write_text(json.dumps(feats, separators=(",", ":")))
    coast = coastline()
    (aoi.DATA / "coastline.json").write_text(json.dumps(coast, indent=1))
    shore_png(dem, coast)
    uy = urban_year(parts)

    eras = {}
    for key, spec in aoi.ERAS.items():
        yr = spec["year"]
        size = 2048
        img = render(yr, parts, dem, coast, feats, px=size, gray=yr < 1960, fade=0.12 if yr < 1990 else 0.0)
        img.save(aoi.TEX / f"ortho_{key}.webp", quality=80)
        eras[key] = {"year": yr, "file": f"textures/ortho_{key}.webp"}
        print("ortho", key)
    render(1700, parts, dem, coast, feats, built=False).save(aoi.TEX / "landscape.webp", quality=80)

    t = trees(dem, uy)
    np.asarray(t, dtype="<f4").tofile(aoi.DATA / "trees.bin")
    print("trees", len(t))
    (aoi.DATA / "gallery.json").write_text("[]")
    manifest = {"placeholder": True, "orthos": eras, "hires": None, "landscape": "textures/landscape.webp"}
    (aoi.DATA / "manifest.json").write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
