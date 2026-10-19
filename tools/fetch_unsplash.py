#!/usr/bin/env python3
"""Search Unsplash for Saudi landscapes (run in CI; unreachable from the dev container).
Unsplash License: free to use, no permission needed; we still credit the photographer on screen.
Writes unsplash/NN.jpg previews and unsplash/candidates.json (id, photographer, raw URL for full size)."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (tv-screensaver background picker)", "Accept": "application/json"}
QUERIES = ["AlUla", "Saudi Arabia landscape", "Saudi Arabia desert", "Riyadh skyline", "Jeddah", "Abha",
           "Edge of the World Saudi", "Hegra", "Saudi Arabia mountains", "Red Sea Saudi", "Tabuk", "Diriyah",
           "NEOM", "Saudi Arabia night", "Empty Quarter"]


def get(url, raw=False):
    time.sleep(1.5)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read() if raw else json.load(r)


def main():
    out, seen = [], set()
    for q in QUERIES:
        for page in (1, 2):
            try:
                d = get("https://unsplash.com/napi/search/photos?" + urllib.parse.urlencode(
                    {"query": q, "per_page": 30, "page": page, "orientation": "landscape"}))
            except Exception as e:
                print("search failed", q, e)
                break
            for p in d.get("results", []):
                if p["id"] in seen or p.get("premium") or p.get("plus") or p["width"] < 3000:
                    continue
                if p["width"] < p["height"] * 1.3:
                    continue
                seen.add(p["id"])
                out.append({"id": p["id"], "query": q, "w": p["width"], "h": p["height"], "likes": p.get("likes", 0),
                            "desc": (p.get("alt_description") or p.get("description") or "")[:120],
                            "by": p["user"]["name"], "page": p["links"]["html"], "raw": p["urls"]["raw"],
                            "small": p["urls"]["small"]})
    out.sort(key=lambda x: -x["likes"])
    out = out[:96]
    Path("unsplash").mkdir(exist_ok=True)
    for i, p in enumerate(out):
        try:
            Path(f"unsplash/{i:02d}.jpg").write_bytes(get(p["small"], raw=True))
            p["file"] = f"{i:02d}.jpg"
        except Exception as e:
            print("skip", p["id"], e)
    Path("unsplash/candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(out), "candidates")


if __name__ == "__main__":
    main()
