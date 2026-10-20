#!/usr/bin/env bash
# Control the listening app (sa.urtv.listening) from a computer over ADB.
#   optimize/music.sh status
#   optimize/music.sh reciters | stations
#   optimize/music.sh surah sudais 1       play a surah (1-114) by a reciter id
#   optimize/music.sh radio 0              a live station (0 = Saudi Quran Radio)
#   optimize/music.sh pause | resume | toggle | next | prev | stop
#   optimize/music.sh seek 10              forward 10 s (negative: back)
#   optimize/music.sh sleep 30             stop after 30 min (0 cancels)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${PY:-}" ]; then
  if [ -x optimize/venv/bin/python ]; then
    PY=optimize/venv/bin/python
  elif [ -x optimize/venv/Scripts/python.exe ]; then
    PY=optimize/venv/Scripts/python.exe
  else
    PY=python3
  fi
fi
tv() { "$PY" -I optimize/tv.py "$@"; }

usage() {
  cat <<'EOF'
Usage: optimize/music.sh <command> [arguments]

  status                  current player state (playing, source, position, error)
  reciters                reciter ids for `surah`
  stations                station indices for `radio`
  surah <id> <1-114>      play a surah, e.g. surah sudais 1
  radio <index>           play a live station, e.g. radio 0
  pause | resume | toggle | next | prev | stop
  seek <seconds>          jump forward/back (e.g. seek -10)
  sleep <minutes>         sleep timer; 0 cancels
EOF
  exit 2
}

command="${1:-}"
[ -n "$command" ] || usage
shift || true

case "$command" in
  status)
    [ $# -eq 0 ] || usage
    out=$(tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.GET")
    data=$(printf '%s\n' "$out" | sed -n 's/.*data="\(.*\)"/\1/p' | tail -n 1)
    if [ -z "$data" ]; then
      echo "No status from sa.urtv.listening. Is the app installed and the TV reachable?" >&2
      exit 1
    fi
    printf '%s\n' "$data"
    ;;

  reciters|stations)
    [ $# -eq 0 ] || usage
    "$PY" - "$command" <<'PY'
import json, pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
which = sys.argv[1]
path = pathlib.Path("android/listening/src/main/assets/quran") / (which + ".json")
for i, item in enumerate(json.loads(path.read_text(encoding="utf-8"))[which]):
    if which == "reciters":
        print(f'{i}\t{item["id"]}\t{item["name"]}')
    else:
        print(f'{i}\t{item["name"]}')
PY
    ;;

  surah)
    [ $# -eq 2 ] || usage
    reciter=$1
    surah=$2
    case "$reciter" in ''|*[!a-z]*) echo "Reciter id must be lowercase letters; run: optimize/music.sh reciters" >&2; exit 2;; esac
    case "$surah" in ''|*[!0-9]*) usage;; esac
    { [ "$surah" -ge 1 ] && [ "$surah" -le 114 ]; } || { echo "Surah must be 1-114." >&2; exit 2; }
    tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.PLAY_SURAH --es reciter $reciter --ei surah $surah" > /dev/null
    echo "Playing surah $surah by $reciter."
    ;;

  radio)
    [ $# -eq 1 ] || usage
    station=$1
    case "$station" in ''|*[!0-9]*) usage;; esac
    tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.PLAY_RADIO --ei station $station" > /dev/null
    echo "Playing station $station."
    ;;

  pause|resume|toggle|next|prev|stop)
    [ $# -eq 0 ] || usage
    action=$(printf '%s' "$command" | tr '[:lower:]' '[:upper:]')
    tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.$action" > /dev/null
    echo "$action sent."
    ;;

  seek)
    [ $# -eq 1 ] || usage
    seconds=$1
    case "$seconds" in ''|*[!0-9-]*) usage;; esac
    digits=${seconds#-}
    case "$digits" in ''|*[!0-9]*) usage;; esac
    ms=$((seconds * 1000))
    tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.SEEK_BY --ei delta $ms" > /dev/null
    echo "Seek ${seconds}s."
    ;;

  sleep)
    [ $# -eq 1 ] || usage
    minutes=$1
    case "$minutes" in ''|*[!0-9]*) usage;; esac
    tv "am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.SLEEP --ei minutes $minutes" > /dev/null
    if [ "$minutes" -eq 0 ]; then echo "Sleep timer cancelled."; else echo "Stopping in $minutes min."; fi
    ;;

  help|-h|--help)
    usage
    ;;
  *)
    usage
    ;;
esac
