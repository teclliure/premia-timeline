# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Shoreline position per era -> public/data/coastline.json and textures/shore.png.

The coast is cut into SEGMENTS stretches along the shore. For each era with an orthophoto we
walk shore-normal transects and find where beach sand turns into water; the result is the
shoreline offset in metres relative to today (+ = beach wider / shoreline further out to sea).
Automatic picks are noisy (waves, shadows, B&W film), so scripts/coastline_manual.json can
override any era: {"1946": [offset per segment, ...], ...}. Eras before the first photo come
from the manual file only and are marked as estimates in the app.

shore.png (1024 px, the whole box):
  R = signed distance to today's shoreline, 2 m per step, 127 = shoreline, <127 = land
  G = position along the coast 0..255 (segment = G / 256 * SEGMENTS), 0 outside the coastal band
The terrain shader raises/lowers the beach by offset * beach slope within that band.
"""
import json
import math

import numpy as np
from PIL import Image
from scipy import ndimage

import aoi

SEGMENTS = 16
BAND = 250.0  # metres either side of the shoreline that the offset may touch
B = aoi.bbox()
SIZE = B["size"]
HALF = SIZE / 2
DEM = np.fromfile(aoi.DATA / "dem.bin", dtype="<i2").astype(np.float32) / 10
N = int(math.isqrt(DEM.size))
DEM = DEM.reshape(N, N)


def shoreline_frame():
    """Signed distance (m, + = sea) and an along-shore coordinate, both on the DEM grid."""
    sea = DEM <= 0
    cell = SIZE / N
    d_sea = ndimage.distance_transform_edt(sea) * cell
    d_land = ndimage.distance_transform_edt(~sea) * cell
    signed = np.where(sea, d_sea, -d_land)
    # Along-shore axis: principal direction of the shoreline pixels.
    edge = sea & ~ndimage.binary_erosion(sea)
    r, c = np.nonzero(edge)
    pts = np.stack([(c + 0.5) * cell - HALF, HALF - (r + 0.5) * cell], 1)
    mean = pts.mean(0)
    _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
    axis = vt[0] if vt[0][0] > 0 else -vt[0]  # pointing roughly east-north-east
    yy, xx = np.mgrid[0:N, 0:N]
    gx = (xx + 0.5) * cell - HALF
    gy = HALF - (yy + 0.5) * cell
    along = (gx - mean[0]) * axis[0] + (gy - mean[1]) * axis[1]
    proj = (pts - mean) @ axis
    a0, a1 = float(proj.min()), float(proj.max())
    return signed, along, a0, a1, axis, mean


def measure(era: str, signed, along, a0, a1) -> list[float] | None:
    p = aoi.RAW / f"ortho_{era}.jpg"
    if not p.exists():
        return None
    img = np.asarray(Image.open(p).convert("L").resize((N, N), Image.LANCZOS)).astype(np.float32)
    img = ndimage.gaussian_filter(img, 1)
    offs = []
    for s in range(SEGMENTS):
        lo = a0 + (a1 - a0) * s / SEGMENTS
        hi = a0 + (a1 - a0) * (s + 1) / SEGMENTS
        sel = (along >= lo) & (along < hi) & (np.abs(signed) < BAND)
        if sel.sum() < 50:
            offs.append(0.0)
            continue
        # Mean brightness by distance bin; the sand/water edge is the steepest drop.
        bins = np.arange(-BAND, BAND + 1, 5)
        idx = np.digitize(signed[sel], bins)
        prof = np.array([img[sel][idx == i].mean() if np.any(idx == i) else np.nan for i in range(1, len(bins))])
        prof = np.nan_to_num(prof, nan=np.nanmean(prof))
        grad = np.diff(ndimage.uniform_filter1d(prof, 3))
        k = int(np.argmin(grad))  # largest brightness drop going seaward
        offs.append(round(float(bins[k] + 5), 1))
    return offs


def main() -> None:
    signed, along, a0, a1, axis, mean = shoreline_frame()
    band = np.abs(signed) < BAND
    r = np.clip(127 + signed / 2, 0, 255).astype(np.uint8)
    g = np.where(band, np.clip((along - a0) / (a1 - a0) * 255, 1, 255), 0).astype(np.uint8)
    rgb = np.stack([r, g, np.zeros_like(r)], -1)
    aoi.TEX.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).resize((1024, 1024), Image.NEAREST).save(aoi.TEX / "shore.png", optimize=True)

    keys = []
    for era, spec in aoi.ERAS.items():
        if era == "now":
            continue
        offs = measure(era, signed, along, a0, a1)
        if offs:
            keys.append({"year": spec["year"], "offsets": offs, "kind": "measured"})
            print(era, offs)
    manual_path = aoi.ROOT / "scripts/coastline_manual.json"
    if manual_path.exists():
        manual = json.loads(manual_path.read_text())
        for year, offs in manual.get("keys", {}).items():
            keys = [k for k in keys if k["year"] != int(year)]
            keys.append({"year": int(year), "offsets": offs, "kind": "manual"})
    keys.append({"year": 2026, "offsets": [0.0] * SEGMENTS, "kind": "measured"})
    keys.sort(key=lambda k: k["year"])
    out = {"segments": SEGMENTS, "band": BAND, "axis": [float(axis[0]), float(axis[1])],
           "origin": [float(mean[0]), float(mean[1])], "range": [a0, a1], "keys": keys}
    (aoi.DATA / "coastline.json").write_text(json.dumps(out, indent=1))
    print("coastline keys", [k["year"] for k in keys])


if __name__ == "__main__":
    main()
