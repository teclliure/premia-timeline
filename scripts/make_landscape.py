# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Pre-urban landscape texture, trees and era crops.

Inputs: raw/ortho_1946.jpg (or 1956), raw/ortho_now.jpg, public/textures/urban_year.png,
public/data/dem.bin. Outputs:
  textures/landscape.webp  the 1946 photo with every built-up texel replaced by fields, so the
                           shader can show the town only where urban_year has passed
  data/trees.bin           Float32 records [x, y, z, height, kind, from, until] (local metres)
                           kind 0 = tree detected in the current ortho, 1 = orchard tree,
                           2 = vine row stock (illustrative, see notes)
"""
import json
import math

import numpy as np
from PIL import Image
from scipy import ndimage

import aoi

B = aoi.bbox()
SIZE = B["size"]
HALF = SIZE / 2
DEM = np.fromfile(aoi.DATA / "dem.bin", dtype="<i2").astype(np.float32) / 10
N = int(math.isqrt(DEM.size))
DEM = DEM.reshape(N, N)

VINE_UNTIL = 1890  # phylloxera reached the Maresme at the end of the 19th c. (see timeline notes)
ORCHARD_FROM = 1890


def year_of_byte(b: np.ndarray) -> np.ndarray:
    y = 1700 + (b.astype(np.float32) - 1) / 253 * 330
    return np.where(b == 255, 9999, np.where(b == 0, 1600, y))


def ground(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    c = np.clip((x + HALF) / SIZE * N - 0.5, 0, N - 1).astype(int)
    r = np.clip((HALF - y) / SIZE * N - 0.5, 0, N - 1).astype(int)
    return DEM[r, c]


def landscape(px: int = 2048) -> np.ndarray:
    base_path = next((aoi.RAW / f"ortho_{k}.jpg" for k in ("1946", "1956") if (aoi.RAW / f"ortho_{k}.jpg").exists()), None)
    if base_path is None:
        raise SystemExit("needs raw/ortho_1946.jpg or raw/ortho_1956.jpg (fetch_raster.py ortho)")
    img = np.asarray(Image.open(base_path).convert("RGB").resize((px, px), Image.LANCZOS)).astype(np.float32)
    uy = year_of_byte(np.asarray(Image.open(aoi.TEX / "urban_year.png").resize((px, px), Image.NEAREST)))
    built = uy < 1946
    # Fill the town with the colour of the fields around it (iterated masked blur) and add a
    # faint furrow pattern parallel to the coast so the filled area does not look smeared.
    fill = img.copy()
    known = (~built).astype(np.float32)
    for sigma in (4, 12, 32, 64):
        num = ndimage.gaussian_filter(img * known[..., None], (sigma, sigma, 0))
        den = ndimage.gaussian_filter(known, sigma)[..., None] + 1e-4
        fill = np.where(built[..., None] & (den > 0.05), num / den, fill)
    yy, xx = np.mgrid[0:px, 0:px]
    furrow = 1 + 0.06 * np.sin((xx * 0.57 - yy * 0.82) * 0.9)
    fill *= furrow[..., None]
    soft = ndimage.gaussian_filter(built.astype(np.float32), 2)[..., None]
    return np.clip(img * (1 - soft) + fill * soft, 0, 255).astype(np.uint8)


def detect_trees() -> list[list[float]]:
    p = aoi.RAW / "ortho_now.jpg"
    if not p.exists():
        return []
    px = 4000  # 1 m per texel
    rgb = np.asarray(Image.open(p).convert("RGB").resize((px, px), Image.LANCZOS)).astype(np.float32)
    exg = 2 * rgb[..., 1] - rgb[..., 0] - rgb[..., 2]
    veg = ndimage.gaussian_filter(exg, 1.2)
    peaks = (veg == ndimage.maximum_filter(veg, size=5)) & (veg > 28)
    r, c = np.nonzero(peaks)
    x = (c + 0.5) - HALF
    y = HALF - (r + 0.5)
    z = ground(x, y)
    keep = z > 0.5
    size = np.clip(ndimage.uniform_filter((veg > 20).astype(np.float32), 7)[r, c] * 9, 3, 12)
    out = []
    for xi, yi, zi, si in zip(x[keep], y[keep], z[keep], size[keep]):
        out.append([float(xi), float(yi), float(zi), float(si), 0, -9000, 9999])
    print("trees detected", len(out))
    return out


def crops(rng: np.random.Generator) -> list[list[float]]:
    """Orchards and vines on gentle land that was later built over (until = urban year)."""
    uy_img = year_of_byte(np.asarray(Image.open(aoi.TEX / "urban_year.png")))
    px = uy_img.shape[0]
    out = []
    for _ in range(60000):
        x, y = rng.uniform(-HALF, HALF, 2)
        z = float(ground(np.array([x]), np.array([y]))[0])
        if z < 2:
            continue
        until = float(uy_img[int((HALF - y) / SIZE * px), int((x + HALF) / SIZE * px)])
        if until < 1700:
            continue
        if rng.random() < 0.55:
            out.append([x, y, z, 0.9, 2, -100, min(VINE_UNTIL, until)])
        else:
            out.append([x, y, z, 4.0, 1, ORCHARD_FROM, until])
    return out


def main() -> None:
    aoi.TEX.mkdir(parents=True, exist_ok=True)
    Image.fromarray(landscape()).save(aoi.TEX / "landscape.webp", quality=80, method=6)
    rng = np.random.default_rng(7)
    trees = detect_trees() + crops(rng)
    np.asarray(trees, dtype="<f4").tofile(aoi.DATA / "trees.bin")
    manifest_path = aoi.DATA / "manifest.json"
    m = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    m["landscape"] = "textures/landscape.webp"
    manifest_path.write_text(json.dumps(m, indent=1))
    print("trees.bin", len(trees))


if __name__ == "__main__":
    main()
