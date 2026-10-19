#!/usr/bin/env bash
# One-time setup: the pure-Python ADB client (no adb binary needed, works where macOS blocks adb).
# The APKs are built by GitHub Actions, so no Android SDK is needed here.
# Adapted from github.com/mihirgupta0900/tv-home (MIT).
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv venv
venv/bin/pip install -q --no-cache-dir -r requirements.txt
echo "✓ Python ADB client in optimize/venv"
