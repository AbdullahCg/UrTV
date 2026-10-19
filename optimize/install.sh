#!/usr/bin/env bash
# Download the latest APKs from GitHub and install them on the TV.
#   optimize/install.sh saver      شاشة السعودية: install + make it the screensaver
#   optimize/install.sh launcher   the home screen: install + make it the default Home
#   optimize/install.sh all        both
# The first install of the screensaver replaces an APK signed with another key: uninstall the old one first
# (pm uninstall com.abdullah.tvsaver) — this script does that only if a plain install fails.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
REL=https://github.com/tshi-dev/TV-ScreenSaver/releases/download/apk-latest
# Google TV's stock launcher; older Android TV sets use com.google.android.tvlauncher.
STOCK_LAUNCHER="${STOCK_LAUNCHER:-com.google.android.apps.tv.launcherx}"
what="${1:?usage: optimize/install.sh saver|launcher|all}"

push_install() {   # $1 apk name, $2 package
  curl -fsSL -o "optimize/$1" "$REL/$1"
  "$PY" -I optimize/tv.py --push-b64 "optimize/$1" "/data/local/tmp/$1"
  if ! "$PY" -I optimize/tv.py "pm install -r /data/local/tmp/$1" | grep -q Success; then
    echo "Plain install failed (different signing key?). Uninstalling the old $2 and retrying."
    "$PY" -I optimize/tv.py "pm uninstall $2" || true
    "$PY" -I optimize/tv.py "pm install -r /data/local/tmp/$1" | grep Success
  fi
  "$PY" -I optimize/tv.py "rm -f /data/local/tmp/$1"
}

if [ "$what" = saver ] || [ "$what" = all ]; then
  push_install tvsaver.apk com.abdullah.tvsaver
  printf '%s\n' \
    "settings put secure screensaver_enabled 1" \
    "settings put secure screensaver_components com.abdullah.tvsaver/.ScreenDream" \
    "settings put secure screensaver_default_component com.abdullah.tvsaver/.ScreenDream" \
    "am start -n com.abdullah.tvsaver/.SettingsActivity" \
    | "$PY" -I optimize/tv.py --batch
  echo "Screensaver installed and selected. Its settings screen is open on the TV."
fi

if [ "$what" = launcher ] || [ "$what" = all ]; then
  push_install tvhome.apk com.abdullah.tvhome
  printf '%s\n' \
    "pm grant com.abdullah.tvhome android.permission.ACCESS_FINE_LOCATION" \
    "cmd package set-home-activity --user 0 com.abdullah.tvhome/.MainActivity" \
    "pm disable-user --user 0 $STOCK_LAUNCHER" \
    "pm disable-user --user 0 com.google.android.tungsten.setupwraith" \
    "cmd package set-home-activity --user 0 com.abdullah.tvhome/.MainActivity" \
    "am force-stop com.android.tv.settings" \
    "input keyevent KEYCODE_HOME" \
    | "$PY" -I optimize/tv.py --batch
  echo "Launcher installed. Press Home on the remote. Undo: optimize/restore.sh <debloat list>"
fi
