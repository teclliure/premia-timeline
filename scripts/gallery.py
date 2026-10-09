# /// script
# dependencies = ["requests", "pillow"]
# ///
"""Historical images for the in-app gallery -> public/gallery/*.webp + public/data/gallery.json.

Sources:
  * Wikimedia Commons, category "Premià de Mar" and its history subcategories. Only files whose
    licence is public domain, CC0, CC BY or CC BY-SA are kept; author and licence are recorded.
  * scripts/gallery_manual.json for images from the Arxiu Municipal de Premià de Mar or the Museu
    de l'Estampació, **only** after their licence has been confirmed in writing. Each entry:
    {"file": "raw/gallery/xxx.jpg", "title", "year", "author", "licence", "licence_url", "source_url"}

    uv run scripts/gallery.py              # Commons + manual
    uv run scripts/gallery.py --max 60     # cap the number of Commons files
"""
import io
import json
import re
import sys

import requests
from PIL import Image

import aoi

API = "https://commons.wikimedia.org/w/api.php"
ROOT_CATEGORY = "Category:Premià de Mar"
OK = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? ?[0-9.]*)", re.I)
S = requests.Session()
import urllib3.util.connection as _uc  # noqa: E402

_uc.HAS_IPV6 = False
S.headers["User-Agent"] = "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)"
OUT = aoi.PUBLIC / "gallery"


def members(cat: str, kind: str = "file") -> list[str]:
    out, cont = [], {}
    while True:
        r = S.get(API, params={"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": kind,
                               "cmlimit": 200, "format": "json", **cont}, timeout=60).json()
        out += [m["title"] for m in r.get("query", {}).get("categorymembers", [])]
        if "continue" not in r:
            return out
        cont = r["continue"]


def walk(root: str, depth: int = 2) -> list[str]:
    """Category and its subcategories, `depth` levels down."""
    seen, level = [root], [root]
    for _ in range(depth):
        nxt = [c for cat in level for c in members(cat, "subcat") if c not in seen]
        seen += nxt
        level = nxt
    return seen


def info(titles: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(titles), 40):
        r = S.get(API, params={"action": "query", "titles": "|".join(titles[i:i + 40]), "prop": "imageinfo",
                               "iiprop": "url|extmetadata", "iiurlwidth": 1600, "format": "json"}, timeout=60).json()
        for page in r.get("query", {}).get("pages", {}).values():
            if "imageinfo" in page:
                out.append({"title": page["title"], **page["imageinfo"][0]})
    return out


def strip(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def year_from(meta: dict) -> int | None:
    for key in ("DateTimeOriginal", "DateTime"):
        m = re.search(r"\b(1[5-9]\d\d|20[0-2]\d)\b", strip(meta.get(key, {}).get("value", "")))
        if m:
            return int(m.group(1))
    return None


def save(img: Image.Image, stem: str) -> tuple[str, str]:
    OUT.mkdir(parents=True, exist_ok=True)
    big = img.copy()
    big.thumbnail((1600, 1600))
    big.save(OUT / f"{stem}.webp", quality=80)
    th = img.copy()
    th.thumbnail((360, 360))
    th.save(OUT / f"{stem}_t.webp", quality=75)
    return f"gallery/{stem}.webp", f"gallery/{stem}_t.webp"


# One photo per place card (src/places.ts). Searched in Commons' File namespace; the first
# freely licensed result wins. Any date is fine: these illustrate the place, not an era.
PLACE_QUERIES = {
    "can_manent": ["Can Manent Premià de Mar", "Can Manent Premià"],
    "gas": ["Fàbrica del Gas Premià de Mar", "Museu de l'Estampació Premià de Mar"],
    "fabrica_lio": ["Fàbrica Lió Premià de Mar", "Lió Premià de Mar"],
    "can_gravada": ["Can Gravada Premià de Mar", "carrer Gibraltar Premià de Mar"],
    "church": ["Sant Cristòfol Premià de Mar"],
    "can_sanpere": ["Can Sanpere Premià de Mar", "carrer Sant Cristòfol 41 Premià de Mar", "xemeneia Premià de Mar"],
    "villa": ["Museu Romà Premià de Mar", "Can Ferrerons Premià de Mar"],
    "port": ["Port de Premià de Mar"],
}


def search_files(q: str) -> list[str]:
    r = S.get(API, params={"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": 10,
                           "format": "json"}, timeout=60).json()
    return [h["title"] for h in r.get("query", {}).get("search", [])]


def place_images() -> None:
    out = {}
    for pid, queries in PLACE_QUERIES.items():
        for q in queries:
            hit = None
            for f in info(search_files(q)):
                meta = f.get("extmetadata", {})
                lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
                if OK.match(lic) and f.get("thumburl") and not f["title"].lower().endswith((".svg", ".pdf", ".tif", ".tiff")):
                    hit = (f, meta, lic)
                    break
            if not hit:
                continue
            f, meta, lic = hit
            img = Image.open(io.BytesIO(S.get(f["thumburl"], timeout=120).content)).convert("RGB")
            file, thumb = save(img, f"place_{pid}")
            out[pid] = {"title": strip(meta.get("ObjectName", {}).get("value", "")) or f["title"][5:],
                        "author": strip(meta.get("Artist", {}).get("value", "")) or "desconegut",
                        "licence": lic, "licence_url": strip(meta.get("LicenseUrl", {}).get("value", "")),
                        "source_url": f["descriptionurl"], "file": file, "thumb": thumb,
                        "year": year_from(meta)}
            print("place", pid, lic, out[pid]["title"][:60])
            break
        else:
            print("place", pid, "no freely licensed photo found")
    (aoi.DATA / "places.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


def main() -> None:
    place_images()
    cap = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 80
    cats = walk(ROOT_CATEGORY)
    titles = sorted({t for c in cats for t in members(c)})
    print(len(cats), "categories,", len(titles), "files")
    items = []
    skipped = {"licence": 0, "no date": 0, "after 1995": 0}
    for f in info(titles):
        meta = f.get("extmetadata", {})
        lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
        year = year_from(meta)
        if not OK.match(lic):
            skipped["licence"] += 1
            continue
        if year is None:
            skipped["no date"] += 1
            continue
        if year > 1995:
            skipped["after 1995"] += 1
            continue
        stem = f"commons_{len(items):03d}"
        img = Image.open(io.BytesIO(S.get(f["thumburl"], timeout=120).content)).convert("RGB")
        file, thumb = save(img, stem)
        items.append({"id": stem, "year": year, "title": strip(meta.get("ObjectName", {}).get("value", "")) or f["title"][5:],
                      "author": strip(meta.get("Artist", {}).get("value", "")) or "desconegut",
                      "licence": lic, "licence_url": strip(meta.get("LicenseUrl", {}).get("value", "")),
                      "source_url": f["descriptionurl"], "file": file, "thumb": thumb})
        print(year, lic, items[-1]["title"][:60])
        if len(items) >= cap:
            break
    manual = aoi.ROOT / "scripts/gallery_manual.json"
    if manual.exists():
        for i, m in enumerate(e for e in json.loads(manual.read_text()) if isinstance(e, dict) and "file" in e):
            stem = f"local_{i:03d}"
            file, thumb = save(Image.open(aoi.ROOT / m["file"]).convert("RGB"), stem)
            items.append({**{k: v for k, v in m.items() if k != "file"}, "id": stem, "file": file, "thumb": thumb})
    print("skipped", skipped)
    items.sort(key=lambda x: x["year"])
    (aoi.DATA / "gallery.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print("gallery", len(items))


if __name__ == "__main__":
    main()
