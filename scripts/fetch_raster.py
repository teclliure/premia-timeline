# /// script
# dependencies = ["requests", "pyproj", "numpy", "pillow", "tifffile", "lxml"]
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
import sys

import numpy as np
import requests
import tifffile
from lxml import etree

import aoi

B = aoi.bbox()
X0, Y0, X1, Y1 = B["bbox"]
S = requests.Session()
S.headers["User-Agent"] = "premia-timeline data pipeline (https://github.com/)"
print("bbox", B["bbox"], aoi.CRS)


def capabilities(url: str) -> list[tuple[str, str]]:
    """(name, title) of every named layer in a WMS GetCapabilities document."""
    try:
        r = S.get(url, params={"SERVICE": "WMS", "REQUEST": "GetCapabilities"}, timeout=60)
        r.raise_for_status()
        doc = etree.fromstring(r.content)
    except Exception as e:  # noqa: BLE001 - report and move on to the next candidate
        print(f"  ! {url}: {e}")
        return []
    out = []
    for layer in doc.iter("{*}Layer"):
        name = layer.findtext("{*}Name")
        if name:
            out.append((name, layer.findtext("{*}Title") or ""))
    return out


def resolve(era: str) -> tuple[str, str] | None:
    for url, needles in aoi.ERAS[era]["candidates"]:
        layers = capabilities(url)
        for needle in needles:
            for name, title in layers:
                if needle.lower() in (name + " " + title).lower():
                    return url, name
    return None


def wcs_tiff(url: str, params: dict) -> np.ndarray:
    r = S.get(url, params=params, timeout=600)
    ct = r.headers.get("content-type", "")
    if r.status_code != 200 or "tiff" not in ct:
        raise RuntimeError(f"{r.status_code} {ct} {r.text[:300]}")
    return tifffile.imread(io.BytesIO(r.content)).astype(np.float32), r.content


def fetch_dem() -> None:
    # 1) ICGC (MET 2 m / 5 m). The WCS path has changed over the years; we look it up.
    tried = []
    for url in ("https://geoserveis.icgc.cat/servei/catalunya/mdt/wcs",
                "https://geoserveis.icgc.cat/icgc_mdt5m/wcs/service"):
        try:
            r = S.get(url, params={"SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCapabilities"}, timeout=60)
            ids = [e.text for e in etree.fromstring(r.content).iter("{*}CoverageId")]
        except Exception as e:  # noqa: BLE001
            tried.append(f"{url}: {e}")
            continue
        pick = next((c for c in ids if "5m" in c.lower()), None) or next((c for c in ids if "2m" in c.lower()), None)
        if not pick:
            tried.append(f"{url}: coverages {ids}")
            continue
        try:
            a, raw = wcs_tiff(url, {"SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage", "COVERAGEID": pick,
                                    "SUBSET": [f"x({X0},{X1})", f"y({Y0},{Y1})"], "FORMAT": "image/tiff"})
            (aoi.RAW / "dem_land.tif").write_bytes(raw)
            print("dem ICGC", pick, a.shape, float(a.min()), float(a.max()))
            (aoi.RAW / "dem_source.txt").write_text(f"ICGC {url} {pick}\n")
            return
        except Exception as e:  # noqa: BLE001
            tried.append(f"{url} {pick}: {e}")
    print("ICGC DEM not available, falling back to IGN MDT05:\n  " + "\n  ".join(tried))
    # 2) IGN MDT05 (the same WCS the Ronda timeline uses, in UTM 31N).
    url = "https://servicios.idee.es/wcs-inspire/mdt"
    a, raw = wcs_tiff(url, {"SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage",
                            "COVERAGEID": "Elevacion25831_5", "SUBSET": [f"x({X0},{X1})", f"y({Y0},{Y1})"],
                            "FORMAT": "image/tiff"})
    (aoi.RAW / "dem_land.tif").write_bytes(raw)
    (aoi.RAW / "dem_source.txt").write_text(f"IGN {url} Elevacion25831_5\n")
    print("dem IGN", a.shape, float(a.min()), float(a.max()))


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
            print(f"{era}: no layer found — run `list` and add the right name to scripts/aoi.py")
            continue
        url, layer = hit
        px = spec["px"]
        r = S.get(url, params={"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "",
                               "CRS": aoi.CRS, "BBOX": f"{X0},{Y0},{X1},{Y1}", "WIDTH": px, "HEIGHT": px,
                               "FORMAT": "image/jpeg"}, timeout=900)
        ct = r.headers.get("content-type", "")
        print(era, layer, r.status_code, ct, len(r.content))
        if ct.startswith("image"):
            (aoi.RAW / f"ortho_{era}.jpg").write_bytes(r.content)
            sources[era] = {"url": url, "layer": layer, "year": spec["year"]}
        else:
            print(r.text[:400])
    (aoi.RAW / "ortho_sources.json").write_text(json.dumps(sources, indent=1))


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
