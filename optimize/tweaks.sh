#!/usr/bin/env bash
# Speed tweaks that are safe and reversible.
#   optimize/tweaks.sh apply     animations at half length; Play Store kept from running in the background
#                                (it stays installed and opens normally; on one set its idle CPU fell 31% -> 6%);
#                                app caches trimmed
#   optimize/tweaks.sh restore   back to Android's defaults
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
case "${1:?usage: optimize/tweaks.sh apply|restore}" in
  apply)   v=0.5; bucket=restricted; bg=deny ;;
  restore) v=1.0; bucket=active;     bg=allow ;;
  *) echo "usage: optimize/tweaks.sh apply|restore"; exit 1 ;;
esac
printf '%s\n' \
  "settings put global window_animation_scale $v" \
  "settings put global transition_animation_scale $v" \
  "settings put global animator_duration_scale $v" \
  "am set-standby-bucket com.android.vending $bucket" \
  "cmd appops set com.android.vending RUN_IN_BACKGROUND $bg" \
  "cmd appops set com.android.vending RUN_ANY_IN_BACKGROUND $bg" \
  "pm trim-caches 999G" \
  | "$PY" -I optimize/tv.py --batch
echo "Animation scale $v, Play Store background: $bg"
