#!/usr/bin/env python3
"""Download background candidates from Wikimedia Commons into candidates/ (run in CI, which has internet).

Only landscape photos under free licences (CC0, public domain, CC BY, CC BY-SA), with photographer and licence
recorded in candidates/candidates.json so a chosen photo can be credited on screen.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CATEGORIES = [
    "Category:Featured pictures of Saudi Arabia",
    "Category:Quality images of Saudi Arabia",
    "Category:Valued images of Saudi Arabia",
]
SEARCHES = [
    "AlUla landscape", "Hegra Madain Saleh", "Elephant Rock AlUla", "Edge of the World Riyadh",
    "Tuwaiq escarpment", "Asir mountains", "Abha mountains", "Al Soudah", "Rijal Almaa",
    "Farasan islands", "Red Sea coast Saudi Arabia", "Umluj", "Tabuk desert", "Wadi Disah",
    "Hisma desert", "Empty Quarter Rub al Khali dunes", "Nafud desert", "Taif mountains",
    "Diriyah At-Turaif", "Jeddah corniche", "Al-Ahsa oasis", "Jabal Al-Qarah", "Najran",
    "Jizan mountains Fayfa", "Al Baha", "Hail Jubbah", "Qassim desert", "NEOM coast",
]
FREE = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)
UA = {"User-Agent": "tv-screensaver background picker (github.com/tshi-dev/UrTV)"}
OUT = Path("candidates")
API = "https://commons.wikimedia.org/w/api.php"


def get(url):
    """GET with backoff: Commons answers 429 when asked too fast."""
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 10 * (attempt + 1))
        finally:
            time.sleep(1.5)


def api(params):
    return json.loads(get(API + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": "5"})))


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def files_in(cat):
    params = {"action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file",
              "gcmlimit": "100", "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": "1600",
              "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription"}
    while True:
        d = api(params)
        yield from (d.get("query") or {}).get("pages", {}).values()
        if "continue" not in d:
            return
        params.update(d["continue"])


def searched(q):
    d = api({"action": "query", "generator": "search", "gsrnamespace": "6", "gsrlimit": "20",
             "gsrsearch": q + " filetype:bitmap", "prop": "imageinfo", "iiprop": "url|size|extmetadata",
             "iiurlwidth": "1600", "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription"})
    yield from (d.get("query") or {}).get("pages", {}).values()


def main():
    OUT.mkdir(exist_ok=True)
    seen, picked = set(), []
    sources = [files_in(c) for c in CATEGORIES] + [searched(q) for q in SEARCHES]
    for src in sources:
        for p in src:
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
            w, h = info.get("width", 0), info.get("height", 0)
            if p["title"] in seen or not FREE.match(lic) or w < 2400 or w < h * 1.4 or not info.get("thumburl"):
                continue
            if not p["title"].lower().endswith((".jpg", ".jpeg")):
                continue
            seen.add(p["title"])
            picked.append({"title": p["title"], "thumb": info["thumburl"], "page": info.get("descriptionurl"),
                           "width": w, "height": h, "license": lic,
                           "artist": strip_html(meta.get("Artist", {}).get("value"))[:80],
                           "description": strip_html(meta.get("ImageDescription", {}).get("value"))[:160]})
    out = []
    for i, c in enumerate(picked[:120]):
        name = f"{i:02d}.jpg"
        try:
            (OUT / name).write_bytes(get(c["thumb"]))
            out.append({"file": name, **c})
        except Exception as e:
            print("skip", c["title"], e)
    (OUT / "candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} candidates")


if __name__ == "__main__":
    main()
