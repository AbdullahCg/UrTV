#!/usr/bin/env bash
# شاشة تلفزيونك's settings, for agents: no remote, no menus.
#   optimize/saver.sh show                         current settings, and last which screensaver is active (ours or the TV's own)
#   optimize/saver.sh off                          the TV's own screensaver back (the one from before setup; else a stock one; else none);
#                                                  ours stays installed, with its settings
#   optimize/saver.sh on                           ours again
#   optimize/saver.sh cities                       built-in Saudi cities by region
#   optimize/saver.sh city الرس                    a built-in city (Arabic name as listed, or a short form of it: مكة; says if it fits several)
#   optimize/saver.sh city 'اسم' 25.86 43.49       any place: name, latitude, longitude; its time zone is the TV's own
#   optimize/saver.sh city 'الكويت' 29.37 47.98 Asia/Kuwait   ... or the one you give (a built-in city is always Asia/Riyadh)
#   optimize/saver.sh find-team الهلال             a club's id (Arabic or English name): id:Name | league
#   optimize/saver.sh teams 136013:Al-Hilal 150643:Al-Zulfi    followed teams in order (up to 20; more are left out and listed)
#   optimize/saver.sh card prayers                 beside the clock: shows prayers forecast hourly prayerrow matches verse wisdom adhkar stocks tasks year none
#   optimize/saver.sh home-card none               on the home screen (launcher): same choices, none = off
#   optimize/saver.sh greeting off                 home screen: the greeting (by prayer time) and the weather line under it: on (default) or off
#   optimize/saver.sh genres Drama,Comedy          episodes card: Drama Comedy Action Crime Thriller Mystery
#                                                  Science-Fiction Fantasy Adventure Romance Family History Horror
#                                                  Anime Documentary Sports  ("" = all)
#   optimize/saver.sh langs Arabic,English         episodes card: English Arabic Korean Japanese Turkish Spanish
#                                                  French Hindi German  ("" = all)
#   optimize/saver.sh minrating 7                  episodes card: lowest rating shown: 0 6 6.5 7 7.5 8
#   optimize/saver.sh photos 15                    change the photo every N minutes: 5 10 15 30 60 (default 30)
#   optimize/saver.sh idle 10                      the TV starts the screensaver after N idle minutes: 1 2 5 10 15 30
#                                                  (the TV's own timer; left alone unless you run this)
#   optimize/saver.sh cardstyle glass1             look of the card beside the clock: current dark1 glass1 dark3 glass3
#   optimize/saver.sh national off                 the quiet green look on National Day (21-25 Sep) and Founding Day (20-24 Feb): auto (default) or off
#   optimize/saver.sh digits latin                 numbers: hindi = ١٢٣ (default), latin = 123
#   optimize/saver.sh markets tasi,gold,btc        top left, up to 4 in order: tasi aramco spx btc gold silver xrp (default tasi,spx,btc)
#   optimize/saver.sh mkstyle prices               markets: arrows (▲▼ only, default) or prices (price and day's change)
#   optimize/saver.sh stocks 2222 1120 AAPL        watchlist of the stocks card (card stocks): up to 8 Tadawul codes (4 digits) or US tickers
#   optimize/saver.sh tasks list                   «المهام» kept on the TV; N = the number list shows
#   optimize/saver.sh tasks add 'نص'               (up to 12, 60 characters each)  |  done N  |  del N  |  clear
#   optimize/saver.sh slot fasting                 the bottom-left slot: matches (default; the weather when no team is followed)
#                                                  weather fasting countdown markets none
#   optimize/saver.sh countdown 2026-12-01 'رحلة الصيف'    the date and name slot=countdown counts down to ("clear" removes it)
#   optimize/saver.sh leagues 'Saudi-Arabian Pro League'   whole leagues, up to 5, by English or Arabic name (دوري روشن السعودي);
#                                                  every game of every club in them joins the teams' games ("" = none)
#   optimize/saver.sh events f1,ufc               other sports beside the teams' games: f1 ufc boxing  ("" = none)
#   optimize/saver.sh update                       download the latest screen now
# Only ADB can change these (sa.urtv.screensaver/.SaverReceiver needs the shell's DUMP).
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
send() {   # $1 action, $2 extras; prints the receiver's answer (the "data" of am broadcast); exit 1 on "error:"
  local out
  out=$("$PY" -I optimize/tv.py "am broadcast -n sa.urtv.screensaver/.SaverReceiver -a sa.urtv.screensaver.$1 ${2:-}" \
    | sed -n '/data="/,$p' | sed '1s/.*data="//; $s/"$//')
  echo "$out"
  [[ "$out" != error:* ]]
}
OURS=sa.urtv.screensaver/.ScreenDream
BACKUP="${SAVER_BACKUP:-optimize/run/backup.txt}"   # optimize/backup.sh's copy of the TV as it came
active() {   # one line: which screensaver the TV uses now
  local out comp en
  out=$(printf '%s\n' "settings get secure screensaver_components" "settings get secure screensaver_enabled" \
    | "$PY" -I optimize/tv.py --batch | tr -d '\r' | grep -v '^\$ ' || true)
  comp=$(sed -n 1p <<< "$out"); en=$(sed -n 2p <<< "$out"); comp="${comp%%,*}"
  if [ "$en" = 0 ]; then echo "screensaver now: off (the TV's screensaver switch is off)"
  elif [ -z "$comp" ] || [ "$comp" = null ]; then echo "screensaver now: the TV's own default"
  elif [[ "$comp" == sa.urtv.screensaver/* ]]; then echo "screensaver now: ours (شاشة تلفزيونك)"
  else echo "screensaver now: the TV's own, $comp"; fi
}
stock_dream() {   # a screensaver this TV lists besides ours: component, or nothing
  local list
  list=$("$PY" -I optimize/tv.py "(cmd package query-services --brief -a android.service.dreams.DreamService || pm query-services --brief -a android.service.dreams.DreamService) 2> /dev/null" \
    | tr -d '\r' | grep -E '^[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+$' | grep -v '^sa\.urtv\.' || true)
  { grep -iE 'backdrop|dream|ambient|photo' <<< "$list" || true; echo "$list"; } | grep -m1 . || true
}
quote() {  # one shell-safe argument for the TV's shell
  case "$1" in *"'"*) echo "no apostrophes please: $1" >&2; exit 1 ;; esac
  printf "'%s'" "$1"
}
case "${1:-}" in
  show)   rc=0; send GET || rc=$?; active; exit "$rc" ;;   # the version line stays first
  on)
    "$PY" -I optimize/tv.py "pm list packages sa.urtv.screensaver" | tr -d '\r' | grep -qx 'package:sa.urtv.screensaver' \
      || { echo "!! Our screensaver is not installed on this TV: optimize/install.sh saver"; exit 1; }
    printf '%s\n' "settings put secure screensaver_enabled 1" "settings put secure screensaver_components $OURS" \
      "settings put secure screensaver_default_component $OURS" | "$PY" -I optimize/tv.py --batch > /dev/null
    active ;;
  off)
    prev=; enabled=
    if [ -f "$BACKUP" ]; then   # what the TV had before setup: components, enabled, screen_off_timeout (backup.sh)
      vals=$(tr -d '\r' < "$BACKUP" | awk '/^== /{s=($2=="screensaver")} s&&!/^==/{print}')
      prev=$(sed -n 1p <<< "$vals"); enabled=$(sed -n 2p <<< "$vals")
    fi
    prev="${prev%%,*}"
    case "$prev" in ""|null|sa.urtv.screensaver/*) prev= ;; esac   # none then, or a backup taken with ours already set
    if [ -n "$prev" ]; then why="the one from before setup"; else why="a stock one"; prev=$(stock_dream); fi
    if [ -n "$prev" ] && [[ "$prev" =~ ^[A-Za-z0-9_.]+/[A-Za-z0-9_.\$]+$ ]]; then
      case "$enabled" in 0|1) ;; *) enabled=1 ;; esac
      printf '%s\n' "settings put secure screensaver_enabled $enabled" "settings put secure screensaver_components '$prev'" \
        "settings delete secure screensaver_default_component" | "$PY" -I optimize/tv.py --batch > /dev/null
      echo "Ours is off ($why is back). It stays installed: optimize/saver.sh on turns it on again."
    else
      printf '%s\n' "settings put secure screensaver_enabled 0" "settings delete secure screensaver_components" \
        "settings delete secure screensaver_default_component" | "$PY" -I optimize/tv.py --batch > /dev/null
      echo "Ours is off, and this TV lists no screensaver of its own, so screensavers are off. It stays installed: optimize/saver.sh on turns it on again."
    fi
    active ;;
  cities) send CITIES ;;
  update) send UPDATE ;;
  city)
    [ $# -eq 2 ] || [ $# -eq 4 ] || [ $# -eq 5 ] || { echo "usage: optimize/saver.sh city NAME [LAT LON [TIMEZONE]]"; exit 1; }
    extra="--es city $(quote "$2")"
    [ $# -ge 4 ] && extra="$extra --es lat $(quote "$3") --es lon $(quote "$4")"
    [ $# -eq 5 ] && extra="$extra --es tz $(quote "$5")"
    send SET "$extra" ;;
  teams)
    shift
    [ $# -gt 0 ] || { echo "usage: optimize/saver.sh teams ID:EnglishName ..."; exit 1; }
    if [ $# -gt 20 ]; then   # the app keeps the first 20 and drops the rest without a word: say so here
      echo "Only 20 teams can be followed. Kept: ${*:1:20}"
      echo "Left out (${#} given): ${*:11}"
      set -- "${@:1:20}"
    fi
    send SET "--es teams $(quote "$(IFS=,; echo "$*")")" ;;
  card)      send SET "--es panel $(quote "${2:?usage: optimize/saver.sh card prayers}")" ;;
  home-card) send SET "--es home_panel $(quote "${2:?usage: optimize/saver.sh home-card none}")" ;;
  greeting)  send SET "--es greeting $(quote "${2:?usage: optimize/saver.sh greeting on|off}")" ;;
  genres)    send SET "--es genres $(quote "${2-}")" ;;
  leagues)   send SET "--es leagues $(quote "${2-}")" ;;
  events)    send SET "--es events $(quote "${2-}")" ;;
  langs)     send SET "--es langs $(quote "${2-}")" ;;
  minrating) send SET "--es minrating $(quote "${2:?usage: optimize/saver.sh minrating 7}")" ;;
  photos)    send SET "--es photos $(quote "${2:?usage: optimize/saver.sh photos 15}")" ;;
  cardstyle) send SET "--es cardstyle $(quote "${2:?usage: optimize/saver.sh cardstyle glass1}")" ;;
  markets)   send SET "--es markets $(quote "${2:?usage: optimize/saver.sh markets tasi,gold,btc}")" ;;
  mkstyle)   send SET "--es mkstyle $(quote "${2:?usage: optimize/saver.sh mkstyle prices}")" ;;
  stocks)
    shift
    [ $# -gt 0 ] || { echo "usage: optimize/saver.sh stocks 2222 1120 AAPL"; exit 1; }
    send SET "--es stocks $(quote "$(IFS=,; echo "$*")")" ;;
  slot)      send SET "--es slot $(quote "${2:?usage: optimize/saver.sh slot fasting}")" ;;
  countdown)
    [ $# -ge 2 ] && [ $# -le 3 ] || { echo "usage: optimize/saver.sh countdown 2026-12-01 'name' | clear"; exit 1; }
    extra="--es countdown $(quote "$2")"
    [ $# -eq 3 ] && extra="$extra --es cdname $(quote "$3")"
    send SET "$extra" ;;
  national)  send SET "--es national $(quote "${2:?usage: optimize/saver.sh national auto|off}")" ;;
  digits)    send SET "--es digits $(quote "${2:?usage: optimize/saver.sh digits latin}")" ;;
  idle)
    # the app may change the TV's timer only if the owner allowed it; the shell always may
    out=$(send SET "--es idle $(quote "${2:?usage: optimize/saver.sh idle 10}")") || true
    case "$out" in
      "error: idle not allowed"*)
        case "$2" in 1|2|5|10|15|30) ;; *) echo "error: idle is one of 1 2 5 10 15 30"; exit 1 ;; esac
        "$PY" -I optimize/tv.py "settings put system screen_off_timeout $(($2 * 60000))"
        echo "idle: $2 (set from the shell)" ;;
      error:*) echo "$out"; exit 1 ;;
      *) echo "$out" ;;
    esac ;;
  tasks)
    case "${2:-}" in
      list)  send TASKS "--es op list" ;;
      clear) send TASKS "--es op clear" ;;
      add)   [ $# -eq 3 ] || { echo "usage: optimize/saver.sh tasks add 'نص'"; exit 1; }
             text=$(quote "$3") || exit 1   # refuse before anything is sent
             send TASKS "--es op add --es text $text" ;;
      done|del)
             [[ "${3:-}" =~ ^[0-9]+$ ]] || { echo "usage: optimize/saver.sh tasks $2 N   (N from 'tasks list')"; exit 1; }
             send TASKS "--es op $2 --ei n $3" ;;
      *) echo "usage: optimize/saver.sh tasks list | add 'نص' | done N | del N | clear"; exit 1 ;;
    esac ;;
  find-team) shift; "$PY" -I optimize/find-team.py "$@" ;;   # Arabic or English name
  *) sed -n '2,40p' "$0"; exit 1 ;;
esac
