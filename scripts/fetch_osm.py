# /// script
# dependencies = ["requests", "pyproj"]
# ///
"""Streets, railway, roads, port, beaches and named places from OpenStreetMap (ODbL) ->
public/data/features.json, in local metres.

features.json:
  lines:  {railway, n2, c32, streets, breakwater}: list of polylines [[x, y], ...]
  areas:  {beach, harbour}: list of rings
  pois:   {church, museu_roma, fabrica_lio, ...}: [x, y]
Landmarks (src/landmarks.ts) read their positions from here, so the hand-made models land on
the real places. Any POI missing from OSM can be added to scripts/pois_manual.json.
"""
import json

import requests
from pyproj import Transformer

import aoi

B = aoi.bbox()
X0, Y0, X1, Y1 = B["bbox"]
to_ll = Transformer.from_crs(aoi.CRS, "EPSG:4326", always_xy=True)
to_utm = Transformer.from_crs("EPSG:4326", aoi.CRS, always_xy=True)
lon0, lat0 = to_ll.transform(X0, Y0)
lon1, lat1 = to_ll.transform(X1, Y1)
bb = f"{lat0},{lon0},{lat1},{lon1}"

QUERY = f"""
[out:json][timeout:180];
(
  way["railway"="rail"]({bb});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian|living_street)$"]({bb});
  way["natural"="beach"]({bb});
  way["man_made"~"^(breakwater|groyne|pier)$"]({bb});
  way["leisure"="marina"]({bb});
  nwr["amenity"="place_of_worship"]({bb});
  nwr["man_made"="chimney"]({bb});
  nwr["tourism"="museum"]({bb});
  nwr["historic"]({bb});
  nwr["railway"~"^(station|halt)$"]({bb});
);
out geom tags;
"""

# POI name patterns -> key used by the app.
POIS = {
    "church": ["sant cristòfol", "sant cristofol"],
    "church_dalt": ["sant pere de premià"],
    "museu_roma": ["museu romà"],
    "museu_estampacio": ["estampació"],
    "fabrica_lio": ["fàbrica lió", "can puiggròs", "escola lió"],
}


def local(lon: float, lat: float) -> list[float]:
    x, y = to_utm.transform(lon, lat)
    return [round(x - B["cx"], 1), round(y - B["cy"], 1)]


def main() -> None:
    headers = {"User-Agent": "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)", "Accept": "application/json"}
    import urllib3.util.connection as uc

    uc.HAS_IPV6 = False  # GitHub runners have no IPv6 route; Overpass resolves to IPv6 first
    r = None
    for host in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
                 "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
        try:
            r = requests.post(host, data={"data": QUERY}, headers=headers, timeout=300)
        except requests.RequestException as e:
            print(host, e)
            continue
        if r.ok:
            break
        print(host, r.status_code, r.text[:200])
    if r is None:
        raise SystemExit("no Overpass server reachable")
    r.raise_for_status()
    els = r.json()["elements"]
    lines = {"railway": [], "n2": [], "c32": [], "streets": [], "breakwater": [], "pier": []}
    areas = {"beach": [], "harbour": []}
    pois: dict[str, list[float]] = {}
    chimneys = []
    for e in els:
        tags = e.get("tags", {})
        geom = e.get("geometry")
        pts = [local(g["lon"], g["lat"]) for g in geom] if geom else []
        centre = local(e["lon"], e["lat"]) if "lon" in e else (
            [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)] if pts else None)
        ref = tags.get("ref", "")
        name = (tags.get("name") or "").lower()
        if tags.get("railway") == "rail" and pts:
            lines["railway"].append(pts)
        elif "highway" in tags and pts:
            if tags["highway"] == "motorway" or ref.startswith("C-32"):
                lines["c32"].append(pts)
            elif ref.startswith("N-II") or "camí ral" in name:
                lines["n2"].append(pts)
            else:
                lines["streets"].append(pts)
        elif tags.get("natural") == "beach" and pts:
            areas["beach"].append(pts)
        elif tags.get("man_made") in ("breakwater", "groyne") and pts:
            lines["breakwater"].append(pts)
        elif tags.get("man_made") == "pier" and pts:
            lines["pier"].append(pts)
        elif tags.get("leisure") == "marina" and pts:
            areas["harbour"].append(pts)
        if tags.get("man_made") == "chimney" and centre:
            chimneys.append(centre)
        if tags.get("railway") in ("station", "halt") and centre and "station" not in pois and "premià de mar" in name:
            pois["station"] = centre
        for key, needles in POIS.items():
            if key not in pois and centre and any(n in name for n in needles):
                pois[key] = centre
    # Places OSM does not name: geocode their documented addresses (Nominatim, max 1 req/s).
    import time

    GEOCODE = {
        "fabrica_lio": "Carrer de Joan Prim 30, Premià de Mar",  # DIBA heritage record
        "museu_roma": "Museu Romà, Premià de Mar",
        "church_dalt": "Sant Pere de Premià, Premià de Dalt",
        "frigorifics": "Carrer del Pilar, Premià de Mar",  # DIBA: Els Frigorífics / Illa de Premià
        "vallpremia": "Vallpremià, Premià de Mar",
        "museu_estampacio": "Carrer de Joan XXIII 2, Premià de Mar",
        "station": "Estació de Premià de Mar",
    }
    for key, q in GEOCODE.items():
        if key in pois:
            continue
        try:
            res = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1},
                               headers=headers, timeout=60).json()
        except (requests.RequestException, ValueError) as e:
            print("geocode", key, e)
            continue
        time.sleep(1.1)
        if res:
            p = local(float(res[0]["lon"]), float(res[0]["lat"]))
            if abs(p[0]) < B["size"] / 2 and abs(p[1]) < B["size"] / 2:
                pois[key] = p
                print("geocoded", key, q, p)
        else:
            print("geocode: nothing for", key, q)
    manual = aoi.ROOT / "scripts/pois_manual.json"
    if manual.exists():
        pois.update({k: v for k, v in json.loads(manual.read_text()).items() if not k.startswith("_")})
    out = {"lines": lines, "areas": areas, "pois": pois, "chimneys": chimneys,
           "attribution": "© OpenStreetMap contributors, ODbL"}
    aoi.DATA.mkdir(parents=True, exist_ok=True)
    (aoi.DATA / "features.json").write_text(json.dumps(out, separators=(",", ":")))
    print({k: len(v) for k, v in lines.items()}, {k: len(v) for k, v in areas.items()}, "pois", pois, "chimneys", len(chimneys))


if __name__ == "__main__":
    main()
