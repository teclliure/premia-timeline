# /// script
# dependencies = ["requests", "pyproj", "numpy", "pillow", "tifffile", "lxml", "scipy"]
# ///
"""Download terrain, bathymetry and the orthophoto of every era for the 4 x 4 km box.

    uv run scripts/fetch_raster.py            # everything
    uv run scripts/fetch_raster.py dem        # only terrain + bathymetry
    uv run scripts/fetch_raster.py ortho      # only orthophotos
    uv run scripts/fetch_raster.py list       # print the WMS layers each endpoint offers

Outputs in raw/: dem_land.tif, bathy.tif, ortho_<era>.jpg, ortho_sources.json.
Catalan services (ICGC) are tried first; IGN is the fallback. Layer names are resolved from
GetCapabilities, so a renamed layer shows up in `list` instead of failing silently.
"""
import io
import json
import re
import sys

import numpy as np
import requests
import tifffile
from lxml import etree

import aoi

B = aoi.bbox()
X0, Y0, X1, Y1 = B["bbox"]
S = requests.Session()
S.headers["User-Agent"] = "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)"
print("bbox", B["bbox"], aoi.CRS)


def capabilities(url: str) -> list[tuple[str, str]]:
    """(name, title) of every named layer in a WMS GetCapabilities document."""
    try:
        r = S.get(url, params={"SERVICE": "WMS", "REQUEST": "GetCapabilities"}, timeout=60)
        r.raise_for_status()
        body = re.sub(rb"<!DOCTYPE[^>]*(\[[^\]]*\])?>", b"", r.content, count=1)
        doc = etree.fromstring(body, etree.XMLParser(recover=True, resolve_entities=False))
    except Exception as e:  # noqa: BLE001 - report and move on to the next candidate
        print(f"  ! {url}: {e}")
        return []
    out = []
    for layer in doc.iter("{*}Layer"):
        name = layer.findtext("{*}Name")
        if name:
            out.append((name, layer.findtext("{*}Title") or ""))
    return out


def getmap(url: str, layer: str, bbox: str, w: int, h: int):
    return S.get(url, params={"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "",
                              "CRS": aoi.CRS, "BBOX": bbox, "WIDTH": w, "HEIGHT": h, "FORMAT": "image/jpeg"}, timeout=900)


def resolve(era: str) -> tuple[str, str] | None:
    """First (endpoint, layer) that returns an image for a small probe of the box."""
    probe = f"{X0},{Y0},{X0 + 200},{Y0 + 200}"
    for url, names in aoi.ERAS[era]["candidates"]:
        tries = list(names)
        layers = None
        for name in tries:
            r = getmap(url, name, probe, 64, 64)
            if r.headers.get("content-type", "").startswith("image"):
                return url, name
            if layers is None:
                layers = capabilities(url)
            for lname, title in layers:
                if name.lower() in (lname + " " + title).lower():
                    r = getmap(url, lname, probe, 64, 64)
                    if r.headers.get("content-type", "").startswith("image"):
                        return url, lname
        print(f"  {era}: nothing usable at {url}")
    return None


def wcs_tiff(url: str, params: dict) -> np.ndarray:
    r = S.get(url, params=params, timeout=600)
    ct = r.headers.get("content-type", "")
    if r.status_code != 200 or "tiff" not in ct:
        raise RuntimeError(f"{r.status_code} {ct} {r.text[:300]}")
    return tifffile.imread(io.BytesIO(r.content)).astype(np.float32), r.content


def fetch_dem() -> None:
    tried = []
    # 1) ICGC MET 5 m, WCS 1.0.0 (icgc.cat: "WCS of the Digital Terrain Model", coverage icc:met).
    url = "https://geoserveis.icgc.cat/icc_mdt/wcs/service"
    for fmt in ("GEOTIFF_FLOAT32", "GeoTIFF", "image/tiff", "GTiff"):
        try:
            a, raw = wcs_tiff(url, {"SERVICE": "WCS", "VERSION": "1.0.0", "REQUEST": "GetCoverage", "COVERAGE": "icc:met",
                                    "CRS": aoi.CRS, "RESPONSE_CRS": aoi.CRS, "BBOX": f"{X0},{Y0},{X1},{Y1}",
                                    "WIDTH": (X1 - X0) // aoi.DEM_CELL, "HEIGHT": (Y1 - Y0) // aoi.DEM_CELL, "FORMAT": fmt})
            if a.ndim == 3:
                a = a[..., 0] if a.shape[-1] < a.shape[0] else a[0]
                tifffile.imwrite(aoi.RAW / "dem_land.tif", a.astype(np.float32))
            else:
                (aoi.RAW / "dem_land.tif").write_bytes(raw)
            print("dem ICGC icc:met", fmt, a.shape, float(np.nanmin(a)), float(np.nanmax(a)))
            (aoi.RAW / "dem_source.txt").write_text(f"ICGC {url} icc:met {fmt}\n")
            return
        except Exception as e:  # noqa: BLE001
            tried.append(f"ICGC {fmt}: {str(e)[:200]}")
    print("ICGC DEM failed:\n  " + "\n  ".join(tried))
    # 2) IGN MDT05 through the IDEE WCS, in ETRS89 lat/lon (EPSG:4258), reprojected to the UTM 31N
    #    grid here. (The UTM coverages it offers are 30N, which would put the box somewhere else.)
    from pyproj import Transformer

    url = "https://servicios.idee.es/wcs-inspire/mdt"
    t = Transformer.from_crs(aoi.CRS, "EPSG:4258", always_xy=True)
    m = 200
    lon0, lat0 = t.transform(X0 - m, Y0 - m)
    lon1, lat1 = t.transform(X1 + m, Y1 + m)
    lon0b, lat1b = t.transform(X0 - m, Y1 + m)
    lon1b, lat0b = t.transform(X1 + m, Y0 - m)
    lon0, lon1 = min(lon0, lon0b), max(lon1, lon1b)
    lat0, lat1 = min(lat0, lat0b), max(lat1, lat1b)
    for subset in ([f"Lat({lat0},{lat1})", f"Long({lon0},{lon1})"], [f"lat({lat0},{lat1})", f"long({lon0},{lon1})"],
                   [f"y({lat0},{lat1})", f"x({lon0},{lon1})"]):
        try:
            a, _ = wcs_tiff(url, {"SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage",
                                  "COVERAGEID": "Elevacion4258_5", "SUBSET": subset, "FORMAT": "image/tiff"})
        except Exception as e:  # noqa: BLE001
            tried.append(f"IGN Elevacion4258_5 {subset[0][:3]}: {str(e)[:200]}")
            continue
        a = a.astype(np.float32)
        a[a < -1000] = np.nan
        n = (X1 - X0) // aoi.DEM_CELL
        cell = (X1 - X0) / n
        xs = X0 + (np.arange(n) + 0.5) * cell
        ys = Y1 - (np.arange(n) + 0.5) * cell
        gx, gy = np.meshgrid(xs, ys)
        lon, lat = t.transform(gx, gy)
        from scipy import ndimage

        col = (lon - lon0) / (lon1 - lon0) * a.shape[1] - 0.5
        row = (lat1 - lat) / (lat1 - lat0) * a.shape[0] - 0.5
        out = ndimage.map_coordinates(np.nan_to_num(a, nan=-1.0), [row, col], order=1, mode="nearest").astype(np.float32)
        tifffile.imwrite(aoi.RAW / "dem_land.tif", out)
        (aoi.RAW / "dem_source.txt").write_text(f"IGN {url} Elevacion4258_5 (MDT05, reprojected to {aoi.CRS})\n")
        print("dem IGN Elevacion4258_5", a.shape, "->", out.shape, float(out.min()), float(out.max()))
        return
    raise SystemExit("no DEM source worked:\n  " + "\n  ".join(tried))


def fetch_bathy() -> None:
    """EMODnet mean depth (~115 m grid, EPSG:4326) for a margin around the box, reprojected
    later by export_terrain.py. Coarse, but enough for a seabed that emerges as the sea drops."""
    from pyproj import Transformer

    t = Transformer.from_crs(aoi.CRS, "EPSG:4326", always_xy=True)
    m = 1500
    lon0, lat0 = t.transform(X0 - m, Y0 - m)
    lon1, lat1 = t.transform(X1 + m, Y1 + m)
    url = "https://ows.emodnet-bathymetry.eu/wcs"
    a, raw = wcs_tiff(url, {"SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage", "COVERAGEID": "emodnet__mean",
                            "SUBSET": [f"Lat({lat0},{lat1})", f"Long({lon0},{lon1})"], "FORMAT": "image/tiff"})
    (aoi.RAW / "bathy.tif").write_bytes(raw)
    (aoi.RAW / "bathy.json").write_text(json.dumps({"lon0": lon0, "lat0": lat0, "lon1": lon1, "lat1": lat1}))
    print("bathy EMODnet", a.shape, float(np.nanmin(a)), float(np.nanmax(a)))


def fetch_orthos() -> None:
    sources = {}
    for era, spec in aoi.ERAS.items():
        hit = resolve(era)
        if not hit:
            print(f"{era}: no layer found — run `list` and fix scripts/aoi.py")
            continue
        url, layer = hit
        px = spec["px"]
        r = getmap(url, layer, f"{X0},{Y0},{X1},{Y1}", px, px)
        ct = r.headers.get("content-type", "")
        print(era, layer, r.status_code, ct, len(r.content))
        if ct.startswith("image"):
            (aoi.RAW / f"ortho_{era}.jpg").write_bytes(r.content)
            sources[era] = {"url": url, "layer": layer, "year": spec["year"]}
        else:
            print(r.text[:400])
    (aoi.RAW / "ortho_sources.json").write_text(json.dumps(sources, indent=1))
    if "now" not in sources or not any(k in sources for k in ("1946", "1956")):
        raise SystemExit("missing the current or the 1946/1956 orthophoto; see the messages above")


if __name__ == "__main__":
    args = set(sys.argv[1:]) or {"dem", "ortho"}
    if "list" in args:
        for era, spec in aoi.ERAS.items():
            for url, _ in spec["candidates"]:
                print(f"\n== {era} · {url}")
                for name, title in capabilities(url):
                    print(f"  {name:45s} {title}")
    if "dem" in args:
        fetch_dem()
        fetch_bathy()
    if "ortho" in args:
        fetch_orthos()
