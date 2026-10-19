#!/usr/bin/env python3
"""Check every hadith shown on the screen against the Sunni collections -> hadith/report.json.

Runs in CI (.github/workflows/hadith.yml): the texts are unreachable from the dev container. Each hadith in
assets/shared/hadith.json is searched (letters only, harakat and punctuation ignored) in the Arabic text of
the six books from github.com/fawazahmed0/hadith-api, and every book and hadith number it appears in is
recorded. A hadith found in none of them must not be shown.
"""
import json
import re
import time
import urllib.request
from pathlib import Path

BOOKS = {  # edition -> Arabic name
    "ara-bukhari": "صحيح البخاري", "ara-muslim": "صحيح مسلم", "ara-abudawud": "سنن أبي داود",
    "ara-tirmidhi": "جامع الترمذي", "ara-nasai": "سنن النسائي", "ara-ibnmajah": "سنن ابن ماجه",
}
URL = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{}.min.json"


def norm(s):
    s = re.sub("[ؐ-ًؚ-ٰٟۖ-ۭـ]", "", s)   # harakat, tatweel
    s = re.sub("[إأآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return " ".join(re.sub("[^ء-ي ]", " ", s).split())


def get(url):
    for wait in (0, 3, 10, 30):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "tv"}), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            err = e
    raise err


def main():
    wanted = json.loads(Path("assets/shared/hadith.json").read_text(encoding="utf-8"))
    books = {}
    for ed, name in BOOKS.items():
        books[ed] = [(h["hadithnumber"], norm(h.get("text") or "")) for h in get(URL.format(ed))["hadiths"]]
        print(name, len(books[ed]), "hadith")
    report = []
    for h in wanted:
        key = norm(h["text"])
        found = [{"book": BOOKS[ed], "edition": ed, "number": n}
                 for ed, rows in books.items() for n, t in rows if key in t]
        report.append({"text": h["text"], "found": found})
        print("OK " if found else "NOT FOUND", h["text"], [(f["book"], f["number"]) for f in found][:6])
    Path("hadith").mkdir(exist_ok=True)
    Path("hadith/report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
