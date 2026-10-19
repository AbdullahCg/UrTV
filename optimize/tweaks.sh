#!/usr/bin/env bash
# Speed and memory tweaks that are safe and reversible. Nothing is uninstalled or disabled here.
#   optimize/tweaks.sh apply     - animations at half length
#                                - Play Store kept from running in the background (it stays installed and opens
#                                  normally; on one set its idle CPU fell 31% -> 6%)
#                                - at most 16 closed apps kept in memory (only if the TV allows more): more free
#                                  RAM, an app not used for a while starts a little slower
#                                - closed apps frozen while cached (no CPU in the background)
#                                - app caches trimmed
#   optimize/tweaks.sh restore   back to Android's defaults
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
CACHED=16
case "${1:?usage: optimize/tweaks.sh apply|restore}" in
  apply)   v=0.5; bucket=restricted; bg=deny ;;
  restore) v=1.0; bucket=active;     bg=allow ;;
  *) echo "usage: optimize/tweaks.sh apply|restore"; exit 1 ;;
esac
cmds=(
  "settings put global window_animation_scale $v"
  "settings put global transition_animation_scale $v"
  "settings put global animator_duration_scale $v"
  "am set-standby-bucket com.android.vending $bucket"
  "cmd appops set com.android.vending RUN_IN_BACKGROUND $bg"
  "cmd appops set com.android.vending RUN_ANY_IN_BACKGROUND $bg"
)
if [ "$1" = apply ]; then
  # never raise the limit: low-RAM sets may already sit below 16
  now=$("$PY" -I optimize/tv.py "dumpsys activity settings | grep -m1 max_cached_processes" | tr -dc '0-9')
  if [ -n "$now" ] && [ "$now" -gt "$CACHED" ]; then
    cmds+=("device_config put activity_manager max_cached_processes $CACHED")
    echo "Closed apps kept in memory: $now -> $CACHED"
  else
    echo "Closed apps kept in memory: ${now:-unknown} (left as is)"
  fi
  cmds+=("settings put global cached_apps_freezer enabled" "pm trim-caches 999G")
else
  cmds+=("device_config delete activity_manager max_cached_processes"
         "settings put global cached_apps_freezer device_default")
fi
printf '%s\n' "${cmds[@]}" | "$PY" -I optimize/tv.py --batch > /dev/null
echo "Animation scale $v, Play Store background: $bg, cached-app freezer: $([ "$1" = apply ] && echo on || echo default)"
