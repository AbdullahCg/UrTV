#!/usr/bin/env python3
"""Checks for the opt-in listening app (sa.urtv.listening): catalog, network rules, manifest.

    python3 tests/listening_test.py

No network and no Android SDK needed. tests/run.sh runs it with the other checks.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "android/listening"
APP = MODULE / "src/main"
ASSETS = APP / "assets/quran"
A = "{http://schemas.android.com/apk/res/android}"
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def load(name):
    return json.loads((ASSETS / name).read_text(encoding="utf-8"))


reciters = load("reciters.json")["reciters"]
stations = load("stations.json")["stations"]
surahs = load("surahs.json")["surahs"]

# ---- the catalog the app ships
check("ten reciters", len(reciters) == 10, len(reciters))
check("unique reciter ids", len({r["id"] for r in reciters}) == len(reciters))
check("unique reciter names", len({r["name"] for r in reciters}) == len(reciters))
check("every reciter has 114 surahs", all(r["surahs"] == 114 for r in reciters),
      [r["id"] for r in reciters if r["surahs"] != 114])
check("reciter audio is https", all(r["server"].startswith("https://") for r in reciters),
      [r["server"] for r in reciters if not r["server"].startswith("https://")])
check("reciter ids are url-safe", all(re.fullmatch(r"[a-z]+", r["id"]) for r in reciters),
      [r["id"] for r in reciters if not re.fullmatch(r"[a-z]+", r["id"])])

wanted = ["السديس", "الشريم", "المعيقلي", "العفاسي", "الغامدي", "الدوسري",
          "عبدالباسط", "المنشاوي", "العجمي", "الحذيفي"]
reciter_names = " ".join(r["name"] for r in reciters)
check("the ten chosen reciters are present", all(w in reciter_names for w in wanted),
      [w for w in wanted if w not in reciter_names])
check("clean reciter names",
      all("\u0640" not in r["name"] and "\ufffd" not in r["name"] and r["name"] == r["name"].strip()
          for r in reciters))

check("live stations", len(stations) >= 10, len(stations))
check("unique station names", len({s["name"] for s in stations}) == len(stations))
check("station streams are https", all(s["url"].startswith("https://") for s in stations),
      [s["url"] for s in stations if not s["url"].startswith("https://")])
check("all stations are live", all(s.get("live") is True for s in stations))
check("Saudi Quran Radio is first",
      bool(stations) and "السعودية" in stations[0]["name"] and "القرآن" in stations[0]["name"],
      stations[0]["name"] if stations else "none")

check("114 surahs", len(surahs) == 114, len(surahs))
check("surah numbers 1 to 114", [s["n"] for s in surahs] == list(range(1, 115)))
check("unique surah names", len({s["name"] for s in surahs}) == 114)
check("first surah is Al-Fatiha", surahs[0]["name"] == "الفاتحة", surahs[0]["name"])
check("last surah is An-Nas", surahs[-1]["name"] == "الناس", surahs[-1]["name"])
check("surah names are plain Arabic", all(re.fullmatch(r"[\u0600-\u06FF ]{1,40}", s["name"]) for s in surahs),
      [s["name"] for s in surahs if not re.fullmatch(r"[\u0600-\u06FF ]{1,40}", s["name"])])
check("no tatweel or broken glyphs",
      all("\u0640" not in s["name"] and "\ufffd" not in s["name"]
          and s["name"] == s["name"].strip() and "  " not in s["name"] for s in surahs))

# ---- cleartext is scoped to the Saudi radio's CDN and nothing else
config = ET.parse(APP / "res/xml/network_security_config.xml").getroot()
base = config.find("base-config")
check("cleartext off by default",
      base is not None and base.get("cleartextTrafficPermitted") == "false",
      base.get("cleartextTrafficPermitted") if base is not None else "no base-config")
allowed = []
for cfg in config.findall("domain-config"):
    if cfg.get("cleartextTrafficPermitted") == "true":
        for domain in cfg.findall("domain"):
            allowed.append((domain.text, domain.get("includeSubdomains")))
check("cleartext only for radiojar.com and subdomains",
      allowed == [("radiojar.com", "true")], allowed)

# ---- manifest: a TV app, a media session, and an ADB receiver only the shell can use
manifest = ET.parse(APP / "AndroidManifest.xml").getroot()
app = manifest.find("application")
check("no global cleartext in the manifest", app.get(A + "usesCleartextTraffic") != "true",
      app.get(A + "usesCleartextTraffic"))
check("backup off", app.get(A + "allowBackup") == "false", app.get(A + "allowBackup"))
check("TV banner and icon set", app.get(A + "banner") == "@drawable/banner"
      and app.get(A + "icon") == "@mipmap/ic_launcher")

main = next(a for a in app.findall("activity") if a.get(A + "name") == ".MainActivity")
check("main activity is exported", main.get(A + "exported") == "true")
categories = {c.get(A + "name") for c in main.find("intent-filter").findall("category")}
check("main activity appears in the TV launcher",
      "android.intent.category.LEANBACK_LAUNCHER" in categories, sorted(categories))

service = next(s for s in app.findall("service") if s.get(A + "name") == ".MusicService")
check("playback service is private", service.get(A + "exported") == "false")
check("playback service is a media playback foreground service",
      service.get(A + "foregroundServiceType") == "mediaPlayback")

receiver = next(r for r in app.findall("receiver") if r.get(A + "name") == ".MusicReceiver")
check("ADB receiver needs the shell-only DUMP permission",
      receiver.get(A + "permission") == "android.permission.DUMP", receiver.get(A + "permission"))
check("ADB receiver is exported", receiver.get(A + "exported") == "true")
actions = {a.get(A + "name") for a in receiver.find("intent-filter").findall("action")}
expected = {"GET", "PLAY_SURAH", "PLAY_RADIO", "PAUSE", "RESUME", "TOGGLE",
            "NEXT", "PREV", "STOP", "SLEEP", "SEEK_BY"}
check("ADB receiver exposes every action", expected <= {a.rsplit(".", 1)[-1] for a in actions},
      sorted(expected - {a.rsplit(".", 1)[-1] for a in actions}))

strings = ET.parse(APP / "res/values/strings.xml").getroot()
labels = {s.get("name"): s.text for s in strings.findall("string")}
check("app label is set", labels.get("app_name") == "استماع", labels.get("app_name"))

gradle = (MODULE / "build.gradle").read_text(encoding="utf-8")
check("package id is sa.urtv.listening",
      "applicationId 'sa.urtv.listening'" in gradle and "namespace 'sa.urtv.listening'" in gradle)
check("listening module uses the CI release key with a debug fallback",
      "ANDROID_KEYSTORE" in gradle and "signingConfigs.debug" in gradle and "tvsaver.keystore" not in gradle)

workflow = (ROOT / ".github/workflows/android.yml").read_text(encoding="utf-8")
check("CI builds, signs and publishes the listening APK",
      workflow.count("urtv-listening.apk") >= 5 and "urtv-listening.apk; do" in workflow,
      workflow.count("urtv-listening.apk"))

if failures:
    print(f"\n{len(failures)} listening check(s) failed.")
    sys.exit(1)
print("\nAll listening checks passed.")
