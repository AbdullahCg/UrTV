#!/usr/bin/env bash
# The home screen's favourites row, for agents and scripts: no remote, no long-press.
#   optimize/dock.sh show                  the current order, left to right
#   optimize/dock.sh apps                  every app that can go in it: package | name
#   optimize/dock.sh set PKG1 PKG2 ...     a new order, left to right (up to 10; fewer than 5 is topped up)
#   optimize/dock.sh reset                 back to the defaults in android/launcher/.../config.xml
#   optimize/dock.sh hidden                apps left off the home screen, and why: package | reason
#   optimize/dock.sh hide PKG ...          take these off the home screen (all its lists)
#   optimize/dock.sh show PKG ...          put these on it, even against the rules (the TV's own home doesn't list them)
#   optimize/dock.sh names                 every app's name: package | shown | its own | from (agent, own, table)
#   optimize/dock.sh name PKG 'الاسم' ...   give apps an Arabic name on this TV (pairs; '' = its usual name again)
#   optimize/dock.sh names-clear           every app back to its usual name
# The home screen redraws at once. Only ADB can do this (sa.urtv.home/.DockReceiver needs the shell's DUMP).
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
send() {   # $1 action, $2 extra arguments; prints the receiver's answer (the "data" of am broadcast)
  "$PY" -I optimize/tv.py "am broadcast -n sa.urtv.home/.DockReceiver -a sa.urtv.home.$1 ${2:-}" \
    | sed -n '/data="/,$p' | sed '1s/.*data="//; $s/"$//'
}
case "${1:-}:$#" in
  show:1) send GET_DOCK ;;
  apps:*)  send LIST_APPS ;;
  reset:*) send RESET_DOCK ;;
  hidden:*) send HIDDEN ;;
  hide:*|show:*)
    what=$(tr '[:lower:]' '[:upper:]' <<< "$1")
    shift
    [ $# -gt 0 ] || { echo "usage: optimize/dock.sh hide|show PKG ..."; exit 1; }
    for p in "$@"; do [[ "$p" =~ ^[A-Za-z0-9_.]+$ ]] || { echo "not a package name: $p"; exit 1; }; done
    send "$what" "--es apps $(IFS=,; echo "$*")" ;;
  set:*)
    shift
    [ $# -gt 0 ] || { echo "usage: optimize/dock.sh set PKG1 PKG2 ..."; exit 1; }
    for p in "$@"; do [[ "$p" =~ ^[A-Za-z0-9_.]+$ ]] || { echo "not a package name: $p"; exit 1; }; done
    send SET_DOCK "--es apps $(IFS=,; echo "$*")" ;;
  names:1) send NAMES ;;
  names-clear:1) send CLEAR_NAMES ;;
  name:*)
    shift
    [ $# -gt 0 ] && [ $(( $# % 2 )) -eq 0 ] || { echo "usage: optimize/dock.sh name PKG 'الاسم' [PKG 'الاسم' ...]"; exit 1; }
    pairs=""
    while [ $# -gt 0 ]; do
      [[ "$1" =~ ^[A-Za-z0-9_.]+$ ]] || { echo "not a package name: $1"; exit 1; }
      case "$2" in *"'"*|*";"*|*"|"*) echo "no ' ; or | in a name: $2"; exit 1 ;; esac
      pairs="$pairs${pairs:+;}$1|$2"
      shift 2
    done
    send SET_NAMES "--es names '$pairs'" ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
