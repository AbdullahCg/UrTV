#!/usr/bin/env bash
# Measure the TV's memory and load, fairly: restart, let it settle 3 minutes on the home screen, then read.
#   optimize/measure.sh before            restart + settle + measure (about 5 minutes)
#   optimize/measure.sh after --now       measure right away, no restart
# Writes optimize/run/ram-<label>.txt and adds a line to optimize/run/summary.md.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
label="${1:?usage: optimize/measure.sh LABEL [--now]}"
mkdir -p optimize/run
out="optimize/run/ram-$label.txt"
if [ "${2:-}" != "--now" ]; then
  "$PY" -I optimize/tv.py --reboot
  echo "letting the TV settle for 3 minutes…"
  "$PY" -I optimize/tv.py "input keyevent KEYCODE_HOME" > /dev/null
  sleep "${SETTLE_S:-180}"
fi
printf '%s\n' \
  "echo '== memory'; grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo" \
  "echo '== android'; dumpsys meminfo | grep -E 'Total RAM|Free RAM|Used RAM|Lost RAM'" \
  "echo '== processes'; ps -A | wc -l" \
  "echo '== cpu'; top -b -n 1 | head -12" \
  "echo '== disabled packages'; pm list packages -d | wc -l" \
  "echo '== biggest'; dumpsys meminfo | grep -A 14 -m1 'Total [PR]SS by process'" \
  | "$PY" -I optimize/tv.py --batch > "$out"

kb() { grep -m1 "^$1:" "$out" | tr -dc '0-9'; }
avail=$(( $(kb MemAvailable) / 1024 )); total=$(( $(kb MemTotal) / 1024 ))
procs=$(sed -n '/== processes/{n;n;p;}' "$out" | tr -dc '0-9')
cpus=$(grep -m1 -oE '[0-9]+%cpu' "$out" | tr -dc '0-9' || true)        # e.g. 400%cpu = 4 cores
idle=$(grep -m1 -oE '[0-9]+%idle' "$out" | tr -dc '0-9' || true)       # summed over the cores
[ -n "$cpus" ] && [ -n "$idle" ] && [ "$cpus" -gt 0 ] && idle=$(( idle * 100 / cpus ))
disabled=$(sed -n '/== disabled packages/{n;n;p;}' "$out" | tr -dc '0-9')
[ -f optimize/run/summary.md ] || printf '| state | free RAM (MB of %s) | processes | CPU idle | disabled packages |\n|---|---|---|---|---|\n' "$total" > optimize/run/summary.md
printf '| %s | %s | %s | %s | %s |\n' "$label" "$avail" "$procs" "${idle:+$idle%}" "$disabled" | tee -a optimize/run/summary.md
