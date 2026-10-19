#!/usr/bin/env bash
# Speed tweaks that are safe and reversible.
#   optimize/tweaks.sh apply     menus feel snappier: animations at half length
#   optimize/tweaks.sh restore   back to Android's defaults
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
case "${1:?usage: optimize/tweaks.sh apply|restore}" in
  apply)   v=0.5 ;;
  restore) v=1.0 ;;
  *) echo "usage: optimize/tweaks.sh apply|restore"; exit 1 ;;
esac
printf '%s\n' \
  "settings put global window_animation_scale $v" \
  "settings put global transition_animation_scale $v" \
  "settings put global animator_duration_scale $v" \
  | "$PY" -I optimize/tv.py --batch
echo "Animation scale $v"
