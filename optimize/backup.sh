#!/usr/bin/env bash
# Save the TV's current state before changing anything: every package, which ones are already
# disabled, the home app, the screensaver and the animation speeds. Writes optimize/backup-<time>.txt.
# Usage: optimize/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
OUT="optimize/backup-$(date +%Y%m%d-%H%M%S).txt"
printf '%s\n' \
  "echo '== model'; getprop ro.product.model; getprop ro.build.version.release" \
  "echo '== disabled packages'; pm list packages -d" \
  "echo '== all packages'; pm list packages" \
  "echo '== home'; cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN" \
  "echo '== screensaver'; settings get secure screensaver_components; settings get secure screensaver_enabled; settings get system screen_off_timeout" \
  "echo '== animation'; settings get global window_animation_scale; settings get global transition_animation_scale; settings get global animator_duration_scale" \
  | "$PY" -I optimize/tv.py --batch > "$OUT"
echo "Saved $OUT"
