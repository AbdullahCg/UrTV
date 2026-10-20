#!/usr/bin/env python3
"""TheSportsDB ids of the Saudi clubs, from their leagues' matches (run in CI; TheSportsDB is unreachable from the
dev container). The free name search misses some clubs altogether (it never returns the Saudi Al-Hilal), but every
match lists both clubs' ids, so a season of the Pro League and the First Division names them all.

Checked, not assumed: Al-Hilal must come out as 136013, the id the app has always used. Writes teams/ids.json
({Arabic name: [id, English name]}, Arabic from assets/shared/teams-ar.json) and teams/ids-unnamed.json (clubs found
with no Arabic name yet), for review before it goes to assets/shared/team-ids.json.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.thesportsdb.com/api/v1/json/123/"
LEAGUES = {"4668": "Saudi-Arabian Pro League", "5627": "Saudi First Division League"}   # data-leagues branch
SEASONS = ["2025-2026", "2024-2025"]
KNOWN = ("Al-Hilal", "136013")


def get(path):
    """The free key allows a few requests a minute: pace them and back off on 429."""
    for attempt in range(8):
        time.sleep(4)
        try:
            with urllib.request.urlopen(urllib.request.Request(API + path, headers={"User-Agent": "urtv"}),
                                        timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(30 * (attempt + 1))
    raise RuntimeError("rate limited: " + path)


def key(name):   # Al-Hilal, Al Hilal, al hilal FC -> alhilal
    name = re.sub(r"\s+(S?FC|F\.C\.|Club|Saudi Club)$", "", name.strip(), flags=re.I)
    return re.sub(r"[^a-z]", "", name.lower())


def main():
    teams = {}   # id -> English name
    for league in LEAGUES:
        paths = [f"eventsseason.php?id={league}&s={s}" for s in SEASONS]
        paths += [f"eventspastleague.php?id={league}", f"eventsnextleague.php?id={league}"]
        for path in paths:
            for e in get(path).get("events") or []:
                for side in ("Home", "Away"):
                    if e.get(f"id{side}Team") and e.get(f"str{side}Team"):
                        teams[e[f"id{side}Team"]] = e[f"str{side}Team"]
    print(len(teams), "clubs from the matches")
    by_key = {key(n): i for i, n in teams.items()}
    if by_key.get(key(KNOWN[0])) != KNOWN[1]:
        raise SystemExit(f"{KNOWN[0]} came out as {by_key.get(key(KNOWN[0]))}, not {KNOWN[1]}: not trusting this")
    arabic = json.loads(Path("assets/shared/teams-ar.json").read_text(encoding="utf-8"))
    ids, named = {}, set()
    for en, ar in arabic.items():
        i = by_key.get(key(en))
        if i and ar not in ids:
            ids[ar] = [i, teams[i]]
            named.add(i)
    unnamed = {i: n for i, n in teams.items() if i not in named}
    Path("teams").mkdir(exist_ok=True)
    Path("teams/ids.json").write_text(json.dumps(ids, ensure_ascii=False, indent=1), encoding="utf-8")
    Path("teams/ids-unnamed.json").write_text(json.dumps(unnamed, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(ids), "with an Arabic name;", len(unnamed), "without")


if __name__ == "__main__":
    main()
