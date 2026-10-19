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
    "1:2", "1:5", "1:6", "2:110", "2:115", "2:156", "2:163", "2:269", "3:31", "3:92",
    "3:134", "3:173", "3:185", "3:190", "3:200", "4:86", "4:110", "6:162", "7:23", "7:199",
    "9:51", "9:129", "10:62", "11:6", "11:114", "11:115", "12:86", "12:87", "14:40", "14:41",
    "15:49", "15:98", "16:18", "16:90", "16:97", "17:24", "17:82", "18:10", "20:46", "20:114",
    "20:132", "21:83", "21:87", "23:118", "25:58", "25:63", "26:80", "26:83", "27:62", "30:21",
    "31:17", "33:3", "33:56", "33:70", "35:34", "39:10", "39:36", "40:44", "40:55", "41:34",
    "42:19", "42:43", "47:7", "49:10", "51:56", "52:48", "53:39", "54:17", "55:27", "55:60",
    "59:22", "64:11", "67:2", "71:10", "73:8", "76:9", "87:14", "87:17", "89:27", "89:28",
    "93:3", "93:11", "94:5", "96:1", "99:7", "108:1", "110:3", "112:1",
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
