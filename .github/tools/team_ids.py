#!/usr/bin/env python3
"""Every club the app's leagues have, and the national teams, with their TheSportsDB ids (run in CI; TheSportsDB is
unreachable from the dev container). The free name search misses some clubs altogether (it never returns the
Saudi Al-Hilal), but every match lists both sides' ids, so a league's recent seasons name all its clubs.

Leagues: the ones the app offers (Prefs.LEAGUES, read from the Java source so the two can't drift), and the
competitions national teams play in. League ids come from TheSportsDB's own list, by those exact names.
Checked, not assumed: Al-Hilal must come out as 136013 and Real Madrid as 133738, the ids the app already uses.

Writes teams/teams.json, [{"id", "en", "ar", "leagues"}] with the Arabic name from assets/shared/teams-ar.json
where it has one, and teams/report.json (leagues not found, counts), for review before assets/shared/teams.json.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.thesportsdb.com/api/v1/json/123/"
PREFS = Path("android/app/src/main/java/sa/urtv/screensaver/Prefs.java")
NATIONAL = ["FIFA World Cup", "FIFA World Cup Qualifying AFC", "AFC Asian Cup", "Arabian Gulf Cup", "FIFA Arab Cup",
            "UEFA European Championships", "Copa America", "African Cup of Nations"]
CLUB_SEASONS = ["2025-2026", "2024-2025"]
NATIONAL_SEASONS = ["2026", "2025", "2024", "2023"]
KNOWN = {"136013": "Al-Hilal", "133738": "Real Madrid"}


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


def team_key(name):   # the screen's teamKey(): "Al-Hilal", "Al Hilal SFC" and "AL HILAL" are one club
    s = re.sub(r"\b(fc|sc|cf|afc|club|saudi club)\b", "", str(name).lower())
    return re.sub(r"^al ", "al", re.sub(r"[^a-z0-9]+", " ", s).strip())


def main():
    club_leagues = re.findall(r'\{"([^"]+)", "[^"]+"\}', PREFS.read_text(encoding="utf-8").split("LEAGUES = {")[1]
                              .split("};")[0])
    ids = {l["strLeague"]: l["idLeague"] for l in get("all_leagues.php").get("leagues") or []}
    report = {"not found": [n for n in club_leagues + NATIONAL if n not in ids], "teams per league": {}}
    teams = {}   # id -> {"en", "leagues"}
    for name in club_leagues + NATIONAL:
        if name not in ids:
            continue
        seasons = NATIONAL_SEASONS if name in NATIONAL else CLUB_SEASONS
        paths = [f"eventsseason.php?id={ids[name]}&s={s}" for s in seasons]
        paths += [f"eventspastleague.php?id={ids[name]}", f"eventsnextleague.php?id={ids[name]}"]
        found = set()
        for path in paths:
            for e in get(path).get("events") or []:
                for side in ("Home", "Away"):
                    i, en = e.get(f"id{side}Team"), e.get(f"str{side}Team")
                    if i and en:
                        t = teams.setdefault(i, {"en": en, "leagues": []})
                        if name not in t["leagues"]:
                            t["leagues"].append(name)
                        found.add(i)
        report["teams per league"][name] = len(found)
        print(f"{name}: {len(found)} teams")
    wrong = {i: n for i, n in KNOWN.items() if team_key(teams.get(i, {}).get("en", "")) != team_key(n)}
    if wrong:
        raise SystemExit(f"these ids didn't come out right, not trusting this: {wrong}")
    arabic = {team_key(en): ar for en, ar in
              json.loads(Path("assets/shared/teams-ar.json").read_text(encoding="utf-8")).items()}
    out = [{"id": i, "en": t["en"], "ar": arabic.get(team_key(t["en"]), ""), "leagues": t["leagues"]}
           for i, t in teams.items()]
    order = club_leagues + NATIONAL
    out.sort(key=lambda t: (order.index(t["leagues"][0]), t["en"]))
    report["teams"] = len(out)
    report["without an Arabic name"] = sum(not t["ar"] for t in out)
    Path("teams").mkdir(exist_ok=True)
    Path("teams/teams.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    Path("teams/report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "teams per league"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
