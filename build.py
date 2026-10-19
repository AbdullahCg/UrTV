#!/usr/bin/env python3
"""src/template.html -> two pages in dist/:

ksa-dashboard.html  stand-alone: fonts and the bundled photos inlined, works offline from a double-click.
tv.html             for the Android app: same page, but fonts and bundled photos are URLs the app serves from
                    its own assets (PhotoCache.java). 2.2 MB less to parse, so the screensaver starts faster.
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FONTS = {
    "__F_LIGHT__": "Thmanyah-Light.woff2",
    "__F_REGULAR__": "Thmanyah-Regular.woff2",
    "__F_MEDIUM__": "Thmanyah-Medium.woff2",
    "__F_DISPLAY__": "ThmanyahDisplay-Bold.woff2",
}
# tv.html points here for fonts and bundled photos; the app answers from its assets, a browser from GitHub.
REPO = "https://raw.githubusercontent.com/tshi-dev/TV-ScreenSaver/master/"


def verses_for_screen():
    """assets/shared/verses.json as fetched from the Quran API (tools/fetch_verses.py), made fit for the font:
    the pause marks and ۞ are left out (Thmanyah has no glyph for them); letters and harakat stay as fetched.
    Surah names are shown plain, without harakat."""
    path = ROOT / "assets/shared/verses.json"
    if not path.is_file():
        return []
    out = []
    for v in json.loads(path.read_text(encoding="utf-8")):
        text = " ".join(re.sub("[\u06D6-\u06DE]", "", v["text"]).split())
        name = re.sub("[\u064B-\u065F\u0670\u06D6-\u06ED]", "", v["surah"])
        out.append({"text": text, "surah": name, "ayah": v["ayah"]})
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
    hadith = json.loads((ROOT / "assets/shared/hadith.json").read_text(encoding="utf-8"))   # checked by CI
    html = html.replace("__HADITH__", json.dumps([{"text": h["text"], "source": h["source"]} for h in hadith
                                                  if h.get("found")], ensure_ascii=False))

    bg_dir = ROOT / "assets/backgrounds"
    bgs = json.loads((bg_dir / "backgrounds.json").read_text(encoding="utf-8"))
    for name, inline in (("ksa-dashboard.html", True), ("tv.html", False)):
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
