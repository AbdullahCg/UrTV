#!/usr/bin/env python3
"""Download the background picks in .github/tools/hq-picks.json from Wikimedia Commons at 3840 px wide (run in CI;
Commons is unreachable from the dev container). Writes hq/<name>.jpg for review and cropping."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "tv-screensaver background picker (github.com/tshi-dev/TV-ScreenSaver)"}


def get(url):
    for attempt in range(6):
        time.sleep(2)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("rate limited")


def main():
    Path("hq").mkdir(exist_ok=True)
    for p in json.load(open(".github/tools/hq-picks.json", encoding="utf-8")):
        q = urllib.parse.urlencode({"action": "query", "titles": p["title"], "prop": "imageinfo",
                                    "iiprop": "url", "iiurlwidth": "3840", "format": "json"})
        page = next(iter(json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))["query"]["pages"].values()))
        info = page["imageinfo"][0]
        Path(f"hq/{p['name']}.jpg").write_bytes(get(info.get("thumburl") or info["url"]))
        print("ok", p["name"])


if __name__ == "__main__":
    main()
