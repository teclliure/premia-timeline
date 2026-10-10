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


def enrich(pois: dict, headers: dict) -> dict:
    """Add geocoded and manual POIs (scripts/pois_manual.json) that OSM does not name."""
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
        "can_manent": ["Camí Ral 54, Premià de Mar", "Can Manent, Premià de Mar", "Biblioteca Can Manent, Premià de Mar"],  # DIBA 58219
        "fundacio_crit": "Carrer de Sant Pau 13, Premià de Mar",  # DIBA 58389
        # Industries from "Els Penjaculpes" (festamajorhivern.pdm.cat): located by street, approximate.
        "vapor_vell": ["Plaça de la Sardana, Premià de Mar"],
        "foneria_roura": ["Plaça dels Països Catalans, Premià de Mar"],
        "can_galindo": ["Carrer de la Indústria, Premià de Mar", "Carrer de Jaume Balmes, Premià de Mar"],
        "ca_lescoda": ["Ajuntament de Premià de Mar", "Plaça de l'Ajuntament, Premià de Mar"],
        "carboniques_pujol": ["Carrer d'Àngel Guimerà, Premià de Mar"],
    }
    for key, qs in GEOCODE.items():
        if key in pois:
            continue
        for q in [qs] if isinstance(qs, str) else qs:
            try:
                res = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "json", "limit": 1},
                                   headers=headers, timeout=60).json()
            except (requests.RequestException, ValueError) as e:
                print("geocode", key, e)
                continue
            finally:
                time.sleep(1.1)
            if res:
                p = local(float(res[0]["lon"]), float(res[0]["lat"]))
                if abs(p[0]) < B["size"] / 2 and abs(p[1]) < B["size"] / 2:
                    pois[key] = p
                    print("geocoded", key, q, p)
                    break
            print("geocode: nothing for", key, q)
    manual = aoi.ROOT / "scripts/pois_manual.json"
    if manual.exists():
        pois.update({k: v for k, v in json.loads(manual.read_text()).items() if not k.startswith("_")})
    return pois


def main() -> None:
    headers = {"User-Agent": "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)", "Accept": "application/json"}
    import urllib3.util.connection as uc

    uc.HAS_IPV6 = False  # GitHub runners have no IPv6 route; Overpass resolves to IPv6 first
    r = None
    hosts = ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter")
    import time as _time

    for attempt in range(3):
        for host in hosts:
            try:
                r = requests.post(host, data={"data": QUERY}, headers=headers, timeout=300)
            except requests.RequestException as e:
                print(host, e)
                r = None
                continue
            if r.ok:
                break
            print(host, r.status_code, r.text[:120].replace("\n", " "))
        if r is not None and r.ok:
            break
        _time.sleep(60 * (attempt + 1))
    existing = aoi.DATA / "features.json"
    if r is None or not r.ok:
        if not existing.exists():
            raise SystemExit("Overpass unavailable and no features.json to keep")
        print("Overpass unavailable: keeping the OSM features already in features.json, refreshing places only")
        old = json.loads(existing.read_text())
        old["pois"] = enrich(old.get("pois", {}), headers)
        existing.write_text(json.dumps(old, separators=(",", ":")))
        print("pois", old["pois"])
        return
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
    pois = enrich(pois, headers)
    out = {"lines": lines, "areas": areas, "pois": pois, "chimneys": chimneys,
           "attribution": "© OpenStreetMap contributors, ODbL"}
    aoi.DATA.mkdir(parents=True, exist_ok=True)
    (aoi.DATA / "features.json").write_text(json.dumps(out, separators=(",", ":")))
    print({k: len(v) for k, v in lines.items()}, {k: len(v) for k, v in areas.items()}, "pois", pois, "chimneys", len(chimneys))


if __name__ == "__main__":
    main()
