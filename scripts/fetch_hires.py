# /// script
# dependencies = ["requests", "pyproj", "pillow", "lxml", "numpy", "tifffile", "scipy"]
# ///
"""Latest orthophoto at 0.5 m for the inner box (historic centre, seafront, railway).

Requested in tiles (most WMS servers cap images at 4096 px) and stitched into
raw/ortho_hires.jpg; export_terrain.py turns it into public/textures/ortho_hires.webp.
"""
import io
import json

from PIL import Image

import aoi
from fetch_raster import S, resolve

RES = 0.5
TILE = 2000  # px per request
B = aoi.bbox()
I = aoi.INNER
x0, y0 = B["cx"] + I["x0"], B["cy"] + I["y0"]
w, h = round((I["x1"] - I["x0"]) / RES), round((I["y1"] - I["y0"]) / RES)
url, layer = resolve("now") or (None, None)
if not url:
    raise SystemExit("no current orthophoto layer found; see `fetch_raster.py list`")

out = Image.new("RGB", (w, h))
for ty in range(0, h, TILE):
    for tx in range(0, w, TILE):
        tw, th = min(TILE, w - tx), min(TILE, h - ty)
        bx0 = x0 + tx * RES
        by1 = y0 + (h - ty) * RES
        bbox = f"{bx0},{by1 - th * RES},{bx0 + tw * RES},{by1}"
        r = S.get(url, params={"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "",
                               "CRS": aoi.CRS, "BBOX": bbox, "WIDTH": tw, "HEIGHT": th, "FORMAT": "image/jpeg"}, timeout=600)
        if not r.headers.get("content-type", "").startswith("image"):
            raise SystemExit(r.text[:400])
        out.paste(Image.open(io.BytesIO(r.content)).convert("RGB"), (tx, ty))
        print("tile", tx, ty)
out.save(aoi.RAW / "ortho_hires.jpg", quality=90)
(aoi.RAW / "ortho_hires.json").write_text(json.dumps({"inner": I, "res": RES, "url": url, "layer": layer}))
print("hires", out.size)
