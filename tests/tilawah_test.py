#!/usr/bin/env python3
"""Checks for «تلاوة», the Quran and radio screens inside the home app, and the adhan.

    python3 tests/tilawah_test.py

No network and no Android SDK needed. tests/run.sh runs it with the other checks.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "android/launcher"
APP = MODULE / "src/main"
JAVA = APP / "java/sa/urtv/home"
TILAWAH = JAVA / "tilawah"
ASSETS = APP / "assets/quran"
A = "{http://schemas.android.com/apk/res/android}"
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def load(name):
    return json.loads((ASSETS / name).read_text(encoding="utf-8"))


def text(path):
    return Path(path).read_text(encoding="utf-8")


reciters = load("reciters.json")["reciters"]
stations = load("stations.json")["stations"]
surahs = load("surahs.json")["surahs"]

# ---- the catalog the app ships
check("forty reciters", len(reciters) == 40, len(reciters))
check("unique reciter ids", len({r["id"] for r in reciters}) == len(reciters))
check("unique reciter names", len({r["name"] for r in reciters}) == len(reciters))
check("every reciter has 114 surahs", all(r["surahs"] == 114 for r in reciters),
      [r["id"] for r in reciters if r["surahs"] != 114])
check("reciter audio is https", all(r["server"].startswith("https://") for r in reciters),
      [r["server"] for r in reciters if not r["server"].startswith("https://")])
check("reciter ids are url-safe", all(re.fullmatch(r"[a-z]+", r["id"]) for r in reciters),
      [r["id"] for r in reciters if not re.fullmatch(r"[a-z]+", r["id"])])

wanted = ["السديس", "الشريم", "المعيقلي", "العفاسي", "الغامدي", "الدوسري",
          "عبدالباسط", "المنشاوي", "العجمي", "الحذيفي",
          "الحصري", "المطرود", "بصفر", "بليله", "بو خاطر", "علي جابر", "فارس عباد",
          "الدريويز", "الرفاعي", "حنيف", "السويسي", "الخامري", "غيلان", "الحازمي",
          "القحطاني", "الجليل", "ديبان", "العمادي", "جبريل", "الفقيه", "داغستاني",
          "عبدالحكم", "العوسي", "الكندري", "الزهراني", "الصاهود", "السلطني",
          "الشويعي", "سلامة", "اليمني"]
reciter_names = " ".join(r["name"] for r in reciters)
check("the forty chosen reciters are present", all(w in reciter_names for w in wanted),
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

# ---- the listening app is part of the home app now, not a module of its own
check("the old listening module is gone", not (ROOT / "android/listening").exists())
gradle = text(ROOT / "android/settings.gradle")
check("one app in the build", "':listening'" not in gradle, gradle.strip().splitlines()[-1])
check("the tilawah classes live in the launcher",
      (TILAWAH / "MusicService.java").exists() and (TILAWAH / "Catalog.java").exists())
for name in ["Catalog", "MainActivity", "MusicReceiver", "MusicService", "PlayerActivity", "Prefs",
             "SurahActivity", "Ui", "Adhan", "AdhanActivity", "AdhanReceiver", "AdhanScheduler",
             "Place", "PrayerTimes"]:
    source = TILAWAH / f"{name}.java"
    if not source.exists():
        check(f"{name}.java exists", False)
        continue
    body = text(source)
    check(f"{name}.java is in sa.urtv.home.tilawah",
          body.startswith("package sa.urtv.home.tilawah;"), body.splitlines()[0])

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

# ---- manifest: nothing of «تلاوة» may show up among the apps
manifest = ET.parse(APP / "AndroidManifest.xml").getroot()
app = manifest.find("application")
check("no global cleartext in the manifest", app.get(A + "usesCleartextTraffic") != "true",
      app.get(A + "usesCleartextTraffic"))
check("backup off", app.get(A + "allowBackup") == "false", app.get(A + "allowBackup"))
check("the network rules are attached", app.get(A + "networkSecurityConfig") == "@xml/network_security_config")
check("TV banner and icon set", app.get(A + "banner") == "@drawable/banner"
      and app.get(A + "icon") == "@mipmap/ic_launcher")

activities = {a.get(A + "name"): a for a in app.findall("activity")}
for name in [".tilawah.MainActivity", ".tilawah.SurahActivity", ".tilawah.PlayerActivity",
             ".tilawah.AdhanActivity"]:
    activity = activities.get(name)
    check(f"{name} exists and is private",
          activity is not None and activity.get(A + "exported") == "false",
          activity.get(A + "exported") if activity is not None else "missing")
    if activity is None:
        continue
    filters = activity.findall("intent-filter")
    check(f"{name} never appears in the TV launcher",
          not any("android.intent.category.LEANBACK_LAUNCHER" in
                  {c.get(A + "name") for c in f.findall("category")} for f in filters))

service = next(s for s in app.findall("service") if s.get(A + "name") == ".tilawah.MusicService")
check("playback service is private", service.get(A + "exported") == "false")
check("playback service is a media playback foreground service",
      service.get(A + "foregroundServiceType") == "mediaPlayback")

receiver = next(r for r in app.findall("receiver") if r.get(A + "name") == ".tilawah.MusicReceiver")
check("ADB receiver needs the shell-only DUMP permission",
      receiver.get(A + "permission") == "android.permission.DUMP", receiver.get(A + "permission"))
check("ADB receiver is exported", receiver.get(A + "exported") == "true")
actions = {a.get(A + "name") for a in receiver.find("intent-filter").findall("action")}
expected = {"GET_PLAYER", "PLAY_SURAH", "PLAY_RADIO", "PAUSE", "RESUME", "TOGGLE",
            "NEXT", "PREV", "STOP", "SLEEP", "SEEK_BY", "ADHAN", "ADHAN_ON", "ADHAN_OFF", "VOICE"}
check("ADB receiver exposes every action", expected <= {a.rsplit(".", 1)[-1] for a in actions},
      sorted(expected - {a.rsplit(".", 1)[-1] for a in actions}))
check("the old listening actions are gone",
      all("sa.urtv.listening" not in text(f) for f in [APP / "AndroidManifest.xml"]))

adhan_receiver = next(r for r in app.findall("receiver") if r.get(A + "name") == ".tilawah.AdhanReceiver")
check("the adhan receiver is shell-protected too",
      adhan_receiver.get(A + "permission") == "android.permission.DUMP"
      and adhan_receiver.get(A + "exported") == "true")
adhan_actions = {a.get(A + "name") for a in adhan_receiver.find("intent-filter").findall("action")}
check("the adhan alarm is set again after a reboot",
      "android.intent.action.BOOT_COMPLETED" in adhan_actions, sorted(adhan_actions))
check("the adhan alarm action is declared", "sa.urtv.home.ADHAN" in adhan_actions)

permissions = {p.get(A + "name") for p in manifest.findall("uses-permission")}
for permission in ["android.permission.WAKE_LOCK", "android.permission.FOREGROUND_SERVICE",
                   "android.permission.RECEIVE_BOOT_COMPLETED",
                   "android.permission.SCHEDULE_EXACT_ALARM"]:
    check(f"{permission.split('.')[-1]} is declared", permission in permissions)

# ---- the label and the pill in the home screen
strings = ET.parse(APP / "res/values/strings.xml").getroot()
labels = {s.get("name"): s.text for s in strings.findall("string")}
check("the app is called تلاوة", labels.get("app_name") == "تلاوة", labels.get("app_name"))
check("the continue row is «متابعة التلاوة»",
      labels.get("continue_listening") == "متابعة التلاوة", labels.get("continue_listening"))

home = text(JAVA / "MainActivity.java")
check("the home screen has the «تلاوة» pill", '"تلاوة"' in home and "tilawah.MainActivity" in home)

card = text(JAVA / "HomeCard.java")
check("the home card reads the screensaver's settings",
      "sa.urtv.screensaver.config" in card)
check("the home card falls back to the prayer times",
      "panel=prayers&widget=1" in card and "fallback()" in card)
config_xml = text(APP / "res/values/config.xml")
check("the pill can be switched off", 'name="show_listening"' in config_xml)
check("no «استماع» left in the strings",
      "استماع" not in text(APP / "res/values/strings.xml"))

# ---- the adhan
prayers = text(TILAWAH / "PrayerTimes.java")
check("Umm al-Qura: Fajr at 18.5°", "18.5" in prayers)
check("Umm al-Qura: Isha 90 minutes after Maghrib", "90" in prayers and "120" in prayers)
check("Ramadan uses the Umm al-Qura calendar", "islamic-umalqura" in prayers)
check("Aladhan is the online source, method 4", "api.aladhan.com" in prayers and "method=4" in prayers)

adhan = text(TILAWAH / "Adhan.java")
check("21 adhan voices", "VOICES = 21" in adhan)
check("the recordings come from assabile", "media.assabile.com" in adhan)
check("every voice is named after a muezzin",
      "فاروق حضراوي" in adhan and "عبد الباسط عبد الصمد" in adhan and "الحرم المكي" in adhan)
check("the adhan is cached on the TV", "getCacheDir()" in adhan)

main = text(TILAWAH / "MainActivity.java")
check("the screen has three sections",
      all(t in main for t in ("TAB_RECITERS", "TAB_STATIONS", "TAB_ADHAN")))
check("left/right switches the section", "KEYCODE_DPAD_LEFT" in main and "selectTab(" in main)
check("the sections are drawn as a tab bar",
      'android:id="@+id/tabs"' in text(APP / "res/layout/activity_main.xml")
      and "@+id/tab_adhan" in text(APP / "res/layout/activity_main.xml"))
check("the adhan tab names the muezzin", labels.get("adhan_voice") == "المؤذن")

player = text(TILAWAH / "PlayerActivity.java")
check("an adhan cannot be seeked or skipped",
      "adhanPlaying()" in player and "hint_adhan" in player)

# ---- right to left, and the D-pad stays physical
manifest = text(APP / "AndroidManifest.xml")
check("the launcher declares right to left support", 'android:supportsRtl="true"' in manifest)
check("the tilawah screens are laid out right to left",
      all('android:layoutDirection="rtl"' in text(APP / ("res/layout/" + f))
          for f in ("activity_main.xml", "activity_surah.xml", "activity_adhan.xml",
                    "activity_player.xml")))
check("the right key moves to the right", "KEYCODE_DPAD_RIGHT ? -1 : 1" in main)
check("the home is laid out right to left",
      "LAYOUT_DIRECTION_RTL" in text(JAVA / "MainActivity.java"))
check("the home walks its rows by hand",
      "moveFocusSideways" in text(JAVA / "MainActivity.java"))
check("the app tiles are walked too",
      "the focus is on the card inside its box" in text(JAVA / "MainActivity.java"))
home_java = text(JAVA / "MainActivity.java")
check("the clock comes first and the ص after it",
      home_java.index("clockRow.addView(clock);") < home_java.index("clockRow.addView(ampm"))
check("the surah grid is walked by hand", "moveCell" in text(TILAWAH / "SurahActivity.java"))

service_src = text(TILAWAH / "MusicService.java")
check("a surah pauses for the adhan", "prepareAdhanPause" in service_src)
check("and comes back after it", "finishAdhan" in service_src and "resumeAfterAdhan" in service_src)
check("the adhan never becomes the «متابعة» row",
      "source == Prefs.SOURCE_ADHAN) return;   // «متابعة»" in service_src)
check("the alarm is exact and survives idle",
      "setExactAndAllowWhileIdle" in text(TILAWAH / "AdhanScheduler.java"))
check("device location comes from the screensaver",
      "sa.urtv.screensaver.config" in text(TILAWAH / "Place.java"))

workflow = text(ROOT / ".github/workflows/android.yml")
check("CI no longer builds a listening APK", "urtv-listening" not in workflow)

music = text(ROOT / "optimize/music.sh")
check("music.sh drives the new component",
      "sa.urtv.home/.tilawah.MusicReceiver" in music and "sa.urtv.listening" not in music)
check("music.sh can test the adhan", "adhan voice" in music and "sa.urtv.home.ADHAN_" in music)
install = text(ROOT / "optimize/install.sh")
check("install still knows the two apps", "urtv-home.apk" in install and "urtv-screensaver.apk" in install)
reset = text(ROOT / "optimize/reset.sh")
check("reset still removes the old standalone app", "sa.urtv.listening" in reset)
check("reset puts the adhan appop back", "SCHEDULE_EXACT_ALARM" in reset)

if failures:
    print(f"\n{len(failures)} tilawah check(s) failed.")
    sys.exit(1)
print("\nAll tilawah checks passed.")
