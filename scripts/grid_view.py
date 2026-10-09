# /// script
# dependencies = ["pillow"]
# ///
"""Orthophoto window with a labelled local-metre grid, the zones of zones.json and the POIs of
features.json — the image to draw zones over and to check every other output against.

    uv run scripts/grid_view.py ERA X0 Y0 X1 Y1 STEP OUT.png
    uv run scripts/grid_view.py 1946 -1000 -1200 1200 600 100 raw/grid_1946.png

ERA is a raw/ortho_<era>.jpg (1946, 1956, 1980, 1995, 2004, now) or a public/textures/*.webp name.
"""
import json
import sys

from PIL import Image, ImageDraw

import aoi

b = aoi.bbox()
S = b["size"]
H = S / 2
era, x0, y0, x1, y1, step, out = sys.argv[1], *map(float, sys.argv[2:7]), sys.argv[7]
src = aoi.RAW / f"ortho_{era}.jpg"
if not src.exists():
    src = aoi.TEX / f"{era}.webp" if (aoi.TEX / f"{era}.webp").exists() else aoi.TEX / f"ortho_{era}.webp"
img = Image.open(src).convert("RGB")
k = img.width / S
crop = img.crop((int((x0 + H) * k), int((H - y1) * k), int((x1 + H) * k), int((H - y0) * k)))
W = 1400
crop = crop.resize((W, int(W * (y1 - y0) / (x1 - x0))))
d = ImageDraw.Draw(crop)
s = W / (x1 - x0)


def px(p):
    return (p[0] - x0) * s, (y1 - p[1]) * s


x = (x0 // step) * step
while x <= x1:
    d.line([px((x, y1)), px((x, y0))], fill=(255, 255, 0), width=1)
    d.text((px((x, y1))[0] + 2, 2), str(int(x)), fill=(255, 255, 0))
    x += step
y = (y0 // step) * step
while y <= y1:
    d.line([px((x0, y)), px((x1, y))], fill=(0, 255, 255), width=1)
    d.text((2, px((x0, y))[1] + 2), str(int(y)), fill=(0, 255, 255))
    y += step
for z in json.loads((aoi.ROOT / "scripts/zones.json").read_text()):
    pts = [px(p) for p in z["poly"]]
    d.line(pts + [pts[0]], fill=(255, 0, 255), width=3)
    d.text(px(z["seed"]), z["id"], fill=(255, 0, 255))
fpath = aoi.DATA / "features.json"
if fpath.exists():
    f = json.loads(fpath.read_text())
    for name, p in f.get("pois", {}).items():
        cx, cy = px(p)
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], outline=(255, 80, 0), width=2)
        d.text((cx + 7, cy - 6), name, fill=(255, 80, 0))
    for line in f.get("lines", {}).get("railway", []):
        d.line([px(p) for p in line], fill=(255, 40, 40), width=2)
crop.save(out)
print("wrote", out)
