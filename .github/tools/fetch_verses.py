#!/usr/bin/env python3
"""Fetch the text of the "verse of the day" list from api.alquran.cloud (Tanzil text) -> verses/verses.json.

Runs in CI (.github/workflows/verses.yml): the API is unreachable from the dev container. The screen never
holds Quran text typed by hand; it only shows what this script fetched, copied to assets/shared/verses.json.
"""
import json
import time
import urllib.request
from pathlib import Path

# surah:ayah. Short verses of remembrance, patience, gratitude and hope that fit the card.
REFS = [
    "13:28", "94:6", "2:152", "3:139", "14:7", "2:153", "16:128", "2:45", "29:69", "55:13",
    "50:16", "3:8", "2:201", "20:25", "93:5", "33:41", "4:28", "18:46", "39:53", "40:60",
    "2:186", "65:3", "8:46", "25:74", "7:56", "103:3", "94:8", "17:80", "21:89", "28:24",
]
EDITION = "quran-simple"   # standard Arabic script with diacritics; renders in any Arabic font


def get(url):
    for wait in (0, 2, 5, 10):
        time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "urtv"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            err = e
    raise err


def main():
    out = []
    for ref in REFS:
        d = get(f"https://api.alquran.cloud/v1/ayah/{ref}/{EDITION}")["data"]
        out.append({"ref": ref, "surah": d["surah"]["name"], "ayah": d["numberInSurah"], "text": d["text"]})
        print(ref, d["surah"]["name"], len(d["text"].split()), "words")
    Path("verses").mkdir(exist_ok=True)
    Path("verses/verses.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
