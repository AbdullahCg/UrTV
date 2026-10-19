#!/usr/bin/env python3
"""Static checks for the whole repo: build, data files, photos, fonts, scripts, safety lists, private data.

    python3 tests/check.py          (needs: pip install fonttools brotli pillow)

Prints one line per check and exits non-zero if any failed. No network.
"""
import json
import py_compile
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def tracked(*globs):
    out = subprocess.run(["git", "ls-files", *globs], cwd=ROOT, capture_output=True, text=True).stdout.split()
    return [ROOT / f for f in out]


# ---- build
before = {n: (ROOT / "dist" / n).read_bytes() for n in ("your-tv.html", "tv.html") if (ROOT / "dist" / n).is_file()}
r = subprocess.run([sys.executable, "build.py"], cwd=ROOT, capture_output=True, text=True)
check("build.py runs", r.returncode == 0, r.stderr[-400:])
for page, limit in (("your-tv.html", 4_000_000), ("tv.html", 300_000)):
    html = (ROOT / "dist" / page).read_text(encoding="utf-8")
    left = sorted(set(re.findall(r"__[A-Z][A-Z_]+__", html)))
    check(f"{page}: every build token replaced", not left, left)
    check(f"{page}: size under {limit // 1000} KB", len(html.encode()) < limit, len(html.encode()))
stale = [n for n, b in before.items() if (ROOT / "dist" / n).read_bytes() != b]
check("dist/ matched a fresh build (run build.py after editing src/)", len(before) == 2 and not stale, stale)

# ---- data files
for f in tracked("*.json"):
    try:
        json.loads(f.read_text(encoding="utf-8"))
        ok, err = True, ""
    except ValueError as e:
        ok, err = False, e
    check(f"valid JSON: {f.relative_to(ROOT)}", ok, err)

# ---- photos: every listed photo exists, is 1920x1080, has a credit; nothing unlisted
index = json.loads((ROOT / "photos/index.json").read_text(encoding="utf-8"))
listed = {p["f"] for p in index}
on_disk = {p.name for p in (ROOT / "photos").glob("*.jpg")}
check("photos: every index entry has a file", listed <= on_disk, sorted(listed - on_disk))
check("photos: no file missing from the index", on_disk <= listed, sorted(on_disk - listed))
bad = [f for f in sorted(on_disk) if Image.open(ROOT / "photos" / f).size != (1920, 1080)]
check("photos: all 1920x1080", not bad, bad)
credits = (ROOT / "docs/PHOTO-CREDITS.md").read_text(encoding="utf-8")
check("photos: every photo credited in docs/PHOTO-CREDITS.md", all(f in credits for f in on_disk),
      [f for f in on_disk if f not in credits])
bundled = json.loads((ROOT / "assets/backgrounds/backgrounds.json").read_text(encoding="utf-8"))
check("bundled backgrounds exist", all((ROOT / "assets/backgrounds" / b["file"]).is_file() for b in bundled))

# ---- verse and hadith: only checked text, and every character has a glyph
page = (ROOT / "dist/tv.html").read_text(encoding="utf-8")
verses = json.loads(re.search(r"const VERSES = (\[.*?\]);", page, re.S).group(1))
hadith = json.loads(re.search(r"const HADITH = (\[.*?\])\.map", page, re.S).group(1))
check("verses present", len(verses) >= 20, len(verses))
check("hadith present", len(hadith) >= 15, len(hadith))
raw = json.loads((ROOT / "assets/shared/hadith.json").read_text(encoding="utf-8"))
check("hadith on screen are only those found in the six books",
      {h["text"] for h in hadith} == {h["text"] for h in raw if h.get("found")})
font = set(TTFont(ROOT / "assets/fonts/Thmanyah-Regular.woff2").getBestCmap())
marks = set(TTFont(ROOT / "assets/fonts/NotoNaskhArabic-Marks.woff2").getBestCmap())
text = "".join(v["text"] + v["surah"] for v in verses) + "".join(h["text"] + h["source"] for h in hadith)
missing = sorted({c for c in text if not c.isspace() and ord(c) not in font})
check("verse/hadith text: every character in Thmanyah", not missing, missing)
check("NotoMarks has ﷺ ﴿ ﴾", {0xFDFA, 0xFD3E, 0xFD3F} <= marks)
team_ar = json.loads((ROOT / "assets/shared/teams-ar.json").read_text(encoding="utf-8"))
names = "".join(v for v in (team_ar.values() if isinstance(team_ar, dict) else []) if isinstance(v, str))
missing = sorted({c for c in names if not c.isspace() and ord(c) not in font})
check("Arabic team names: every character in Thmanyah", not missing, missing)

# ---- launcher config
cfg = ET.parse(ROOT / "android/launcher/src/main/res/values/config.xml").getroot()
arr = {a.get("name"): [i.text for i in a] for a in cfg.findall("string-array")}
check("launcher: no dock app is also hidden", not set(arr["dock_apps"]) & set(arr["hidden_apps"]))
check("launcher: screensaver app not hidden", "sa.yourtv.screensaver" not in arr["hidden_apps"])

# ---- optimize: never disable a kept package
def pkgs(path):
    return {l.split("#")[0].strip() for l in path.read_text().splitlines() if l.split("#")[0].strip()}
keep = pkgs(ROOT / "optimize/lists/keep.txt")
for lst in sorted((ROOT / "optimize/lists").glob("*.txt")):
    if lst.name != "keep.txt":
        check(f"optimize: {lst.name} disables nothing from keep.txt", not pkgs(lst) & keep, sorted(pkgs(lst) & keep))

# ---- scripts
for f in tracked("*.py"):
    try:
        py_compile.compile(str(f), doraise=True)
        ok, err = True, ""
    except py_compile.PyCompileError as e:
        ok, err = False, e
    check(f"python compiles: {f.relative_to(ROOT)}", ok, err)
for f in tracked("*.sh"):
    r = subprocess.run(["bash", "-n", str(f)], capture_output=True, text=True)
    check(f"bash syntax: {f.relative_to(ROOT)}", r.returncode == 0, r.stderr)

# ---- nothing private or secret in the repo
texts = [f for f in tracked() if f.suffix in {".md", ".py", ".sh", ".java", ".xml", ".json", ".yml", ".html", ".txt", ".gradle"}]
ip = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
allowed_ip = {"0.0.0.0", "127.0.0.1"}
found = []
for f in texts:
    if f.name.endswith(".html") or f.parent.name == "photos" or f == Path(__file__).resolve():   # not this scan
        continue
    s = f.read_text(encoding="utf-8", errors="ignore")
    found += [f"{f.relative_to(ROOT)}: {m}" for m in set(ip.findall(s)) - allowed_ip
              if all(0 <= int(x) <= 255 for x in m.split(".")) and not m.startswith(("1.", "2.", "3.", "4."))]
    if re.search(r"(?i)(client-id|access_key|api_key)\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}", s):
        found.append(f"{f.relative_to(ROOT)}: looks like a key")
    if re.search(r"(?i)tailscale|\.ts\.net", s):
        found.append(f"{f.relative_to(ROOT)}: tailscale")
check("no private IPs, keys or network names", not found, found[:10])

print()
print(f"{len(failures)} failed" if failures else "all checks passed")
sys.exit(1 if failures else 0)
