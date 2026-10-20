#!/usr/bin/env bash
# One-time setup: the pure-Python ADB client (no adb binary needed, works where macOS blocks adb).
# The APKs are built by GitHub Actions, so no Android SDK is needed here. Windows: run it in Git Bash.
# Adapted from github.com/mihirgupta0900/tv-home (MIT).
set -euo pipefail
cd "$(dirname "$0")"
# A Python 3 that really runs: on Windows `python`/`python3` can be a Microsoft Store shortcut that does nothing,
# and the launcher `py -3` is often the one that works
PY=""
for c in python3 python "py -3"; do
  if $c -c "import sys; sys.exit(sys.version_info < (3, 8))" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "!! No working Python 3 here. Windows: winget install -e --id Python.Python.3.12, then a new terminal."; exit 1; }
$PY -m venv venv
if [ ! -e venv/bin/python ] && [ -e venv/Scripts/python.exe ]; then
  # Windows puts it in venv\Scripts: every script calls optimize/venv/bin/python, so point that there
  mkdir -p venv/bin
  printf '#!/usr/bin/env bash\nexec "$(dirname "$0")/../Scripts/python.exe" "$@"\n' > venv/bin/python
  chmod +x venv/bin/python
fi
venv/bin/python -m pip install -q --no-cache-dir -r requirements.txt
echo "✓ Python ADB client in optimize/venv"
