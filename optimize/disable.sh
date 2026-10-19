#!/usr/bin/env bash
# Disable every package in a debloat list (one pm call per shell command; chained pm calls can stop early).
# Packages are disabled for user 0, never uninstalled. Undo with optimize/restore.sh <same list>.
# Usage: optimize/disable.sh optimize/lists/tcl-google-tv.txt
set -euo pipefail
cd "$(dirname "$0")/.."
LIST="${1:?usage: optimize/disable.sh <debloat list>}"
PY="${PY:-optimize/venv/bin/python}"
grep -vE '^\s*(#|$)' "$LIST" | awk '{print "pm disable-user --user 0 " $1}' \
  | "$PY" -I optimize/tv.py --batch
