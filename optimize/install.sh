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
  # Which stock home does this TV have? Google TV sets: launcherx. Older Android TV: tvlauncher.
  if "$PY" -I optimize/tv.py "pm list packages com.google.android.apps.tv.launcherx" | grep -q launcherx; then
    STOCK=com.google.android.apps.tv.launcherx/com.google.android.apps.tv.launcherx.home.HomeActivity
  else
    STOCK=com.google.android.tvlauncher/.MainActivity
  fi
  echo "Stock home: $STOCK"

  # 1. The new home must be installed and working BEFORE anything is disabled.
  push_install tvhome.apk com.abdullah.tvhome
  "$PY" -I optimize/tv.py "pm grant com.abdullah.tvhome android.permission.ACCESS_FINE_LOCATION" || true

  # 2. Arm the safety switch on the TV: it restores the stock home in 180 s unless we confirm.
  "$PY" -I optimize/tv.py --push-b64 optimize/deadman.sh /data/local/tmp/deadman.sh
  printf '%s\n' \
    "rm -f /data/local/tmp/home_ok" \
    "nohup sh /data/local/tmp/deadman.sh $STOCK 180 > /dev/null 2>&1 &" \
    | "$PY" -I optimize/tv.py --batch
  echo "Safety switch armed: the stock home comes back by itself in 3 minutes unless the new home works."

  # 3. Switch. Setup app first, then the stock home (this order avoided the black screen).
  printf '%s\n' \
    "cmd package set-home-activity --user 0 com.abdullah.tvhome/.MainActivity" \
    "pm disable-user --user 0 com.google.android.tungsten.setupwraith" \
    "pm disable-user --user 0 ${STOCK%%/*}" \
    "cmd package set-home-activity --user 0 com.abdullah.tvhome/.MainActivity" \
    "am force-stop com.android.tv.settings" \
    "input keyevent KEYCODE_HOME" \
    | "$PY" -I optimize/tv.py --batch
  sleep 6

  # 4. Verify Home really opens the new launcher, then disarm the switch.
  if "$PY" -I optimize/tv.py "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'" \
       | grep -q com.abdullah.tvhome; then
    "$PY" -I optimize/tv.py "touch /data/local/tmp/home_ok"
    echo "Launcher is home. Press Home from inside an app to double-check."
    echo "Undo: optimize/restore.sh optimize/lists/<your list>   (re-enables the stock home)"
  else
    echo "!! Home did not open the new launcher. Leave the TV alone: the stock home returns within 3 minutes."
    echo "   Some TCL firmware pins Home to the stock launcher; on those sets keep the stock home."
    exit 1
  fi
fi
