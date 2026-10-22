#!/usr/bin/env python3
"""Apply the CI adhkar check (data-hadith branch, hadith/adhkar-report.json) to assets/shared/adhkar.json.

Keeps only the adhkar verify_adhkar.py found and accepted (Bukhari, Muslim, or a Sunan narration Al-Albani grades
Sahih, Hasan or Hasan Sahih; or the Quran), marks them `checked` (the page shows nothing else), and sets their text
and source line from that check: the book's own words with their harakat, «صحيح مسلم · 2723», or the surah and ayahs.
A dhikr shown twice (the same words for the same time of day) is kept once.

usage: git show origin/data-hadith:hadith/adhkar-report.json > /tmp/adhkar-report.json
       python3 .github/tools/apply_adhkar_report.py /tmp/adhkar-report.json
"""
import json
import sys
from pathlib import Path

from verify_adhkar import vh

DATA = Path(__file__).resolve().parents[2] / "assets/shared/adhkar.json"


def main():
    report = {r["text"]: r.get("pick") for r in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))}
    kept, dropped, seen = [], [], set()
    for d in json.loads(DATA.read_text(encoding="utf-8")):
        if d["text"] not in report:
            sys.exit(f"not in the report (run the check again): {d['text']}")
        pick = report[d["text"]]
        if not pick or not pick.get("text"):
            dropped.append(d["text"])
            continue
        key = (d["when"], vh.norm(pick["text"]))
        if key in seen:
            print(f"same dhikr twice: {d['text']}")
            continue
        seen.add(key)
        e = {"when": d["when"], "text": pick["text"], "count": d["count"], "source": pick["source"]}
        if d.get("quran"):
            e["quran"] = d["quran"]
        e["checked"] = True
        kept.append(e)
    DATA.write_text(json.dumps(kept, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"kept {len(kept)}, dropped {len(dropped)} (not found in the six books or the Quran, or not accepted):")
    for t in dropped:
        print("  ", t)


if __name__ == "__main__":
    main()
