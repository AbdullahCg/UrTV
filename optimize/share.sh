#!/usr/bin/env bash
# How the setup went, for the TV's owner to send to UrTV's author if they want to: the TV model and Android
# version, how long each step took and where it stopped, memory before and after, the protected-features check,
# and the agent's notes. Nothing personal (no city, clubs, apps, names, network addresses or paths).
#   optimize/share.sh "what went wrong, how long it cost, how it was fixed"
# Writes optimize/run/share.md, copies it to the clipboard where it can, and says where to send it.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
"$PY" -I optimize/share.py "$@"
