#!/usr/bin/env bash
# Find the TV on this computer's Wi-Fi and save it to optimize/.tv_host (see optimize/find-tv.py, which runs on
# Windows, macOS and Linux).   optimize/find-tv.sh --check   first tells whether this terminal can reach the network.
cd "$(dirname "$0")/.."
# A Python 3 that really runs: on Windows `python`/`python3` can be a Microsoft Store shortcut that does nothing,
# and the launcher `py -3` is often the one that works
PY=""
for c in python3 python "py -3"; do
  if $c -c "import sys; sys.exit(sys.version_info < (3, 8))" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "!! No working Python 3 here. Windows: winget install -e --id Python.Python.3.12, then a new terminal."; exit 1; }
exec $PY -I optimize/find-tv.py "$@"
