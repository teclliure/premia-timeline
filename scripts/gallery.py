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
CATEGORIES = ["Category:History of Premià de Mar", "Category:Premià de Mar", "Category:Old photographs of Premià de Mar"]
OK = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? ?[0-9.]*)", re.I)
S = requests.Session()
S.headers["User-Agent"] = "premia-timeline/0.1 (https://github.com/teclliure/premia-timeline)"
OUT = aoi.PUBLIC / "gallery"


def members(cat: str) -> list[str]:
    files, cont = [], {}
    while True:
        r = S.get(API, params={"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "file",
                               "cmlimit": 200, "format": "json", **cont}, timeout=60).json()
        files += [m["title"] for m in r.get("query", {}).get("categorymembers", [])]
        if "continue" not in r:
            return files
        cont = r["continue"]


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


def main() -> None:
    cap = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 80
    titles = sorted({t for c in CATEGORIES for t in members(c)})
    items = []
    for f in info(titles):
        meta = f.get("extmetadata", {})
        lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
        year = year_from(meta)
        if not OK.match(lic) or year is None or year > 1995:
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
    items.sort(key=lambda x: x["year"])
    (aoi.DATA / "gallery.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print("gallery", len(items))


if __name__ == "__main__":
    main()
