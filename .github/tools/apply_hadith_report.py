#!/usr/bin/env python3
"""Apply the CI hadith check (data-hadith branch, hadith/report.json) to assets/shared/hadith.json.

Keeps only the hadith found in the six books, records where, and writes the source line from that check:
the first two books in the usual order (رواه البخاري ومسلم), or the one book.

usage: git show origin/data-hadith:hadith/report.json > /tmp/report.json
       python3 .github/tools/apply_hadith_report.py /tmp/report.json
"""
import json
import sys
from pathlib import Path

ORDER = [("صحيح البخاري", "البخاري"), ("صحيح مسلم", "مسلم"), ("سنن أبي داود", "أبو داود"),
         ("جامع الترمذي", "الترمذي"), ("سنن النسائي", "النسائي"), ("سنن ابن ماجه", "ابن ماجه")]
DATA = Path(__file__).resolve().parents[2] / "assets/shared/hadith.json"


def main():
    report = {r["text"]: r["found"] for r in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))}
    kept, dropped = [], []
    for h in json.loads(DATA.read_text(encoding="utf-8")):
        found = report.get(h["text"])
        if found is None:
            sys.exit(f"not in the report (run the check again): {h['text']}")
        books = {short: sorted({f["number"] for f in found if f["book"] == full}) for full, short in ORDER}
        books = {k: v for k, v in books.items() if v}
        if not books:
            dropped.append(h["text"])
            continue
        names = list(books)[:2]
        kept.append({"text": h["text"], "source": "رواه " + " و".join(names), "found": books})
    DATA.write_text(json.dumps(kept, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"kept {len(kept)}, dropped {len(dropped)} (not found in these words):")
    for t in dropped:
        print("  ", t)


if __name__ == "__main__":
    main()
