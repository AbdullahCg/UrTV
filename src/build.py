#!/usr/bin/env python3
"""src/template.html -> two pages in dist/:

urtv.html           stand-alone: fonts and the bundled photos inlined, works offline from a double-click.
tv.html             for the Android app: same page, but fonts and bundled photos are URLs the app serves from
                    its own assets (PhotoCache.java). 2.2 MB less to parse, so the screensaver starts faster.
"""
import base64
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = {
    "__F_LIGHT__": "Thmanyah-Light.woff2",
    "__F_REGULAR__": "Thmanyah-Regular.woff2",
    "__F_MEDIUM__": "Thmanyah-Medium.woff2",
    "__F_DISPLAY__": "ThmanyahDisplay-Bold.woff2",
}
# tv.html points here for fonts and bundled photos; the app answers from its assets, a browser from GitHub.
REPO = "https://raw.githubusercontent.com/tshi-dev/UrTV/master/"


BASMALA = "بسم الله الرحمن الرحيم"   # compared without harakat: the API orders them its own way


def plain(s):
    return re.sub("[\u064B-\u065F\u0670]", "", s)


def verses_for_screen():
    """assets/shared/verses.json as fetched from the Quran API (.github/tools/fetch_verses.py), made fit for the font:
    the pause marks and ۞ are left out (Thmanyah has no glyph for them); letters and harakat stay as fetched.
    The API puts the basmala in front of the first verse of a surah; it is not part of that verse, so it goes
    (Al-Fatiha's first verse is the basmala itself). Surah names are shown plain, without harakat."""
    path = ROOT / "assets/shared/verses.json"
    if not path.is_file():
        return []
    out = []
    for v in json.loads(path.read_text(encoding="utf-8")):
        text = " ".join(re.sub("[\u06D6-\u06DE]", "", v["text"]).split())
        words = text.split()
        if v["ayah"] == 1 and not v["ref"].startswith("1:") and plain(" ".join(words[:4])) == BASMALA:
            text = " ".join(words[4:])
        # NFC first: the API writes آ as ا + madda, which stripping the harakat would turn into ا (ال عمران)
        name = re.sub("[\u064B-\u065F\u0670\u06D6-\u06ED]", "", unicodedata.normalize("NFC", v["surah"]))
        name = name.replace("\u0671", "ا")   # ٱ: no glyph in Thmanyah
        out.append({"text": text, "surah": name, "ayah": v["ayah"]})
    return out


HADITH_MAX_WORDS = 70   # a longer narration does not fit the card beside the clock; it stays in the printed list
HARAKAT = "[\u064B-\u0652\u0670]*"
SAW = re.compile(r"\s+".join(HARAKAT.join(w) + HARAKAT for w in "صلى الله عليه وسلم".split()))


def narration_parts(text):
    """A full narration as the book has it -> [["n", narration], ["q", the Prophet's words], ...].

    The books put his words between straight quotes; everything else (the isnad, who asked what, the compiler's
    note) is narration. Only typography changes: direction marks and the tatweel used as a dash go, «صلى الله
    عليه وسلم» becomes ﷺ, {verse} becomes ﴿verse﴾, and no space before a comma or full stop."""
    t = re.sub("[\u200e\u200f]", "", text)
    t = re.sub(r"\s+ـ\s+", " ", t)
    t = SAW.sub("ﷺ", t).replace("{", "﴿").replace("}", "﴾")
    t = re.sub(r"\s+([،,.:؛])", r"\1", t)
    parts = []
    for i, piece in enumerate(t.split('"')):
        piece = " ".join(piece.split()).strip(" .")
        if piece and piece not in ".،:":
            parts.append(["q" if i % 2 else "n", piece])
    return parts


def weak_in_tirmidhi(text):
    """al-Tirmidhi grades each hadith after it («قال أبو عيسى …»). Not shown: one he grades only غريب or ضعيف,
    or says is more correctly a companion's own words (موقوف, «ولم يرفعه»)."""
    bare = re.sub(HARAKAT, "", text)
    if "قال أبو عيسى" not in bare:
        return False
    note = bare[bare.index("قال أبو عيسى"):]
    return not re.search("حديث حسن|حديث صحيح|حسن صحيح", note) or "ولم يرفعه" in bare or "موقوفا" in bare


def hadith_for_screen():
    """assets/shared/hadith.json -> the full narrations that fit the card, each with book and number."""
    digits = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
    out = []
    for h in json.loads((ROOT / "assets/shared/hadith.json").read_text(encoding="utf-8")):
        full = h.get("full")
        if not (h.get("found") and full):
            continue
        parts = narration_parts(full["text"])
        words = sum(len(p[1].split()) for p in parts)
        if weak_in_tirmidhi(full["text"]):
            continue
        if any(k == "q" for k, _ in parts) and words <= HADITH_MAX_WORDS:
            out.append({"parts": parts, "source": f"{full['book']} · {str(full['number']).translate(digits)}"})
    return out


def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main():
    html = (ROOT / "src/template.html").read_text(encoding="utf-8")
    # 2 KB, so inlined in both pages
    html = html.replace("__F_MARKS__", data_uri(ROOT / "assets/fonts/NotoNaskhArabic-Marks.woff2", "font/woff2"))
    teams = json.loads((ROOT / "assets/shared/teams-ar.json").read_text(encoding="utf-8"))
    html = html.replace("__TEAMS_AR__", json.dumps(teams, ensure_ascii=False))
    html = html.replace("__VERSES__", json.dumps(verses_for_screen(), ensure_ascii=False))
    html = html.replace("__HADITH__", json.dumps(hadith_for_screen(), ensure_ascii=False))   # checked by CI

    bg_dir = ROOT / "assets/backgrounds"
    bgs = json.loads((bg_dir / "backgrounds.json").read_text(encoding="utf-8"))
    for name, inline in (("urtv.html", True), ("tv.html", False)):
        page = html
        for token, font in FONTS.items():
            page = page.replace(token, data_uri(ROOT / "assets/fonts" / font, "font/woff2") if inline
                                else REPO + "assets/fonts/" + font)
        entries = []
        for bg in bgs:
            u = data_uri(bg_dir / bg["file"], "image/jpeg") if inline else REPO + "assets/backgrounds/" + bg["file"]
            entries.append(f'  {{u:"{u}", c:{json.dumps(bg["credit"], ensure_ascii=False)}, d:{bg["brightness"]}}}')
        out = ROOT / "dist" / name
        out.parent.mkdir(exist_ok=True)
        out.write_text(page.replace("__BG_SET__", ",\n".join(entries)), encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
