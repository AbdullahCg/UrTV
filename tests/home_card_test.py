#!/usr/bin/env python3
"""The home card when the screensaver's settings can't be read: it keeps the last choice (HomeCardChoice.java), «بدون»
included, and shows the prayers only with nothing remembered. Needs javac (skipped with a note without).
Run: python3 tests/home_card_test.py"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "android/launcher/src/main/java/sa/urtv/home/HomeCardChoice.java"
B = "file:///android_asset/web/tv.html#"
# frag, panel (read now), saved frag, saved panel ("-" = nothing) -> the page
CASES = [
    ("city=Riyadh&panel=old&week=1", "matches", "-", "-", B + "city=Riyadh&panel=matches&widget=1"),   # read: its own panel/week dropped
    ("city=Riyadh", "none", "-", "-", "off"),                                                          # read: «بدون»
    ("-", "-", "-", "-", B + "panel=prayers&widget=1"),                                                # unreadable, nothing remembered
    ("-", "-", "city=Riyadh", "forecast", B + "city=Riyadh&panel=forecast&widget=1"),                  # unreadable: the last card
    ("-", "-", "city=Riyadh", "none", "off"),                                                          # unreadable: «بدون» stays «بدون»
    ("city=Abha", "verse", "city=Riyadh", "none", B + "city=Abha&panel=verse&widget=1"),               # readable wins over the saved
    ("city=Abha", "-", "city=Riyadh", "verse", B + "city=Riyadh&panel=verse&widget=1"),                # half read: the saved one
    ("-", "verse", "-", "-", B + "panel=prayers&widget=1"),                                            # half read, nothing saved
    ("-", "-", "city=Riyadh", "-", B + "panel=prayers&widget=1"),                                      # half saved: not used
]

javac, java = shutil.which("javac"), shutil.which("java")
if not (javac and java):
    print("SKIP HomeCardChoice.java: no javac here (CI's Build APKs compiles it)")
    sys.exit(0)
failed = 0
with tempfile.TemporaryDirectory() as tmp:
    r = subprocess.run([javac, "-encoding", "UTF-8", "-d", tmp, str(SRC), str(ROOT / "tests/HomeCardChoiceRun.java")], capture_output=True, text=True)
    ok = r.returncode == 0
    print(("PASS " if ok else "FAIL ") + "HomeCardChoice.java compiles" + ("" if ok else "  -> " + r.stderr[-600:]))
    failed += not ok
    if ok:
        args = [a for c in CASES for a in c[:4]]
        r = subprocess.run([java, "-cp", tmp, "sa.urtv.home.HomeCardChoiceRun", *args], capture_output=True, text=True)
        got = r.stdout.splitlines()
        for c, g in zip(CASES, got):
            ok = g == c[4]
            print(("PASS " if ok else "FAIL ") + f"{c[:4]} -> {c[4]}" + ("" if ok else f"  -> {g}"))
            failed += not ok
        if len(got) != len(CASES):
            print("FAIL runner printed", len(got), "lines", r.stderr[-300:]); failed += 1
sys.exit(1 if failed else 0)
