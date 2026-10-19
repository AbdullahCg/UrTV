#!/usr/bin/env python3
"""Download background candidates from Wikimedia Commons into candidates/ (run in CI, which has internet).

Only landscape photos under free licences (CC0, public domain, CC BY, CC BY-SA), with photographer and licence
recorded in candidates/candidates.json so a chosen photo can be credited on screen.
"""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

CATEGORIES = [
    "Category:Featured pictures of Saudi Arabia",
    "Category:Quality images of Saudi Arabia",
    "Category:Valued images of Saudi Arabia",
]
FREE = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)
UA = {"User-Agent": "tv-screensaver background picker (github.com/tshi-dev/TV-ScreenSaver)"}
OUT = Path("candidates")
API = "https://commons.wikimedia.org/w/api.php"


def api(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


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


def main():
    OUT.mkdir(exist_ok=True)
    seen, picked = set(), []
    for cat in CATEGORIES:
        for p in files_in(cat):
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
            w, h = info.get("width", 0), info.get("height", 0)
            if p["title"] in seen or not FREE.match(lic) or w < 1920 or w < h * 1.35 or not info.get("thumburl"):
                continue
            if not p["title"].lower().endswith((".jpg", ".jpeg")):
                continue
            seen.add(p["title"])
            picked.append({"title": p["title"], "thumb": info["thumburl"], "page": info.get("descriptionurl"),
                           "width": w, "height": h, "license": lic,
                           "artist": strip_html(meta.get("Artist", {}).get("value"))[:80],
                           "description": strip_html(meta.get("ImageDescription", {}).get("value"))[:160]})
    out = []
    for i, c in enumerate(picked[:80]):
        name = f"{i:02d}.jpg"
        try:
            with urllib.request.urlopen(urllib.request.Request(c["thumb"], headers=UA), timeout=60) as r:
                (OUT / name).write_bytes(r.read())
            out.append({"file": name, **c})
        except Exception as e:
            print("skip", c["title"], e)
        time.sleep(0.5)
    (OUT / "candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} candidates")


if __name__ == "__main__":
    main()
