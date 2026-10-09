# /// script
# dependencies = ["numpy", "tifffile", "pillow", "pyproj", "scipy"]
# ///
"""Merge land DEM + bathymetry into public/data/dem.bin and export the orthophoto textures.

dem.bin: Int16 little-endian, decimetres, row 0 = north, pixel-centre grid of `cols` x `rows`
covering the SIZE x SIZE box (cell = size / cols). Negative values are seabed.
"""
import json

import numpy as np
import tifffile
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

import aoi

B = aoi.bbox()
SIZE = B["size"]
N = SIZE // aoi.DEM_CELL
X0, Y0, X1, Y1 = B["bbox"]


def resample(a: np.ndarray, n: int) -> np.ndarray:
    """Area/bilinear resample of a north-up grid that covers exactly the box."""
    zoom = n / a.shape[0], n / a.shape[1]
    return ndimage.zoom(a, zoom, order=1)[:n, :n]


def land() -> np.ndarray:
    a = tifffile.imread(aoi.RAW / "dem_land.tif").astype(np.float32)
    a[(a < -100) | (a > 9000)] = np.nan  # nodata
    return resample(np.nan_to_num(a, nan=-1.0), N)


def sea(land_m: np.ndarray) -> np.ndarray:
    """Seabed on the DEM grid: EMODnet where available, shaped so depth grows smoothly offshore."""
    is_sea = land_m <= 0.15
    dist = ndimage.distance_transform_edt(is_sea) * aoi.DEM_CELL  # metres from today's shoreline
    profile = -0.6 - 0.018 * dist  # fallback: gentle Maresme shelf slope (~1.8 %)
    bpath = aoi.RAW / "bathy.tif"
    if not bpath.exists():
        print("no bathy.tif: using the fallback slope")
        return profile
    bat = tifffile.imread(bpath).astype(np.float32)  # EMODnet: negative depth, row 0 = north
    meta = json.loads((aoi.RAW / "bathy.json").read_text())
    t = Transformer.from_crs(aoi.CRS, "EPSG:4326", always_xy=True)
    cell = SIZE / N
    xs = X0 + (np.arange(N) + 0.5) * cell
    ys = Y1 - (np.arange(N) + 0.5) * cell
    gx, gy = np.meshgrid(xs, ys)
    lon, lat = t.transform(gx, gy)
    col = (lon - meta["lon0"]) / (meta["lon1"] - meta["lon0"]) * bat.shape[1] - 0.5
    row = (meta["lat1"] - lat) / (meta["lat1"] - meta["lat0"]) * bat.shape[0] - 0.5
    emod = ndimage.map_coordinates(np.nan_to_num(bat, nan=0.0), [row, col], order=1, mode="nearest")
    # EMODnet's 115 m cells smear the shoreline: never shallower than the slope profile near the
    # beach, fully EMODnet from 400 m out.
    w = np.clip(dist / 400.0, 0, 1)
    return np.minimum(profile, profile * (1 - w) + np.minimum(emod, -0.5) * w)


def main() -> None:
    aoi.DATA.mkdir(parents=True, exist_ok=True)
    aoi.TEX.mkdir(parents=True, exist_ok=True)
    lm = land()
    sm = sea(lm)
    dem = np.where(lm > 0.15, lm, sm)
    dem = ndimage.gaussian_filter(dem, 0.6)
    (np.round(dem * 10).clip(-32000, 32000).astype("<i2")).tofile(aoi.DATA / "dem.bin")
    meta = {"cx": B["cx"], "cy": B["cy"], "size": SIZE, "rows": N, "cols": N, "crs": aoi.CRS,
            "min": float(dem.min()), "max": float(dem.max()),
            "source": (aoi.RAW / "dem_source.txt").read_text().strip() if (aoi.RAW / "dem_source.txt").exists() else ""}
    (aoi.DATA / "dem.json").write_text(json.dumps(meta))
    print("dem", meta)

    # Orthophoto textures by era.
    eras = {}
    srcs = json.loads((aoi.RAW / "ortho_sources.json").read_text()) if (aoi.RAW / "ortho_sources.json").exists() else {}
    for key, spec in aoi.ERAS.items():
        p = aoi.RAW / f"ortho_{key}.jpg"
        if not p.exists():
            continue
        size = 4096 if key == "now" else 2048
        Image.open(p).convert("RGB").resize((size, size), Image.LANCZOS).save(aoi.TEX / f"ortho_{key}.webp", quality=80, method=6)
        eras[key] = {"year": spec["year"], "file": f"textures/ortho_{key}.webp", **({"source": srcs[key]} if key in srcs else {})}
    hires = None
    if (aoi.RAW / "ortho_hires.jpg").exists():
        Image.open(aoi.RAW / "ortho_hires.jpg").convert("RGB").save(aoi.TEX / "ortho_hires.webp", quality=78, method=6)
        hires = {"file": "textures/ortho_hires.webp", "box": aoi.INNER}
    manifest_path = aoi.DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.update({"placeholder": False, "orthos": eras, "hires": hires})
    manifest_path.write_text(json.dumps(manifest, indent=1))
    print("orthos", list(eras), "hires", bool(hires))


if __name__ == "__main__":
    main()
