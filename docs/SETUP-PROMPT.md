# Set up a TV with تلفزيونك — prompt for your AI agent

**On the TV first:** Settings → System → About → press OK on **Build** 7 times → back → Developer options →
turn on **USB debugging** (and **Network debugging** if it is listed). Keep the TV on.

**Then** open any AI agent that can run commands, on a computer on the **same Wi-Fi** as the TV, and paste
everything below the line.

---

Set up my Android TV / Google TV with **تلفزيونك** from https://github.com/tshi-dev/TV-ScreenSaver: a faster TV
(bloat off, safely), an Arabic home screen, and the screensaver «شاشة تلفزيونك». Talk to me in Arabic (or my
language); keep commands in English.

## Rules

- Use only the scripts in `optimize/`. They are made for slow, dropping ADB over Wi-Fi: they retry by themselves
  and remember progress. **If a command fails, run the same command again.** Don't write your own adb loops.
- Never send `reboot` as a shell command. Restart only with `optimize/venv/bin/python -I optimize/tv.py --reboot`.
- Never disable anything in `optimize/lists/keep.txt` (AirPlay, Chromecast, mirroring, voice, remote, inputs,
  tuner, firmware updates, Play Store, Google services). Never disable the TV's own home screen or setup app
  yourself; only `optimize/install.sh launcher` does that, behind a 5-minute safety switch.
- Never uninstall system apps. Everything is reversible: `optimize/reset.sh` puts the TV back as it came.
- Ask me before anything not in this prompt. If something fails twice, stop, show me the output, propose a fix.

## 1. Connect (5 minutes)

```
git clone https://github.com/tshi-dev/TV-ScreenSaver && cd TV-ScreenSaver
optimize/setup.sh
optimize/find-tv.sh                       # accept "Allow USB debugging?" on the TV, tick "Always allow"
optimize/venv/bin/python -I optimize/tv.py --probe
```
Tell me the model and Android version. If this TV was set up with these tools before (also older versions, whose
apps are `com.abdullah.*`), run `optimize/reset.sh` first so we start like new.

## 2. What I don't use (2 minutes, with me)

Read `optimize/lists/tcl-optional.txt` and ask me, group by group in plain words, what I never use (the TCL tab and
channels, the game bar, T-Cast, accessory updates, Google TV / Play Movies, YouTube Music, region leftovers).
Copy the package lines of what I give up into `optimize/lists/mine.txt`. If I keep everything, skip this.

## 3. Run it (20–30 minutes, the TV restarts twice)

```
optimize/run.sh
```
It saves the TV's state, measures memory (restart + 3 minutes), disables telemetry/ads/demos and my picks, applies
the speed and memory tweaks, installs the screensaver, installs the home screen behind the safety switch, measures
again and writes `optimize/run/report.md`. If it stops for any reason: `optimize/run.sh` again (it continues), and
`optimize/run.sh status` shows where it is.

If the home-screen step says Home did not switch, leave the TV alone for 5 minutes (the stock home comes back by
itself) and tell me. Some TCL firmware keeps its own home: then `SKIP_LAUNCHER=1 optimize/run.sh`.

## 4. My settings (10 minutes, with me; no remote needed)

```
optimize/saver.sh cities                          # then: optimize/saver.sh city <name>   (or: city <name> <lat> <lon>)
optimize/saver.sh find-team <name>                # then: optimize/saver.sh teams <id:Name> <id:Name> ...  (my order, up to 10)
optimize/saver.sh card <shows|prayers|forecast|matches|verse|none>       # beside the clock
optimize/saver.sh home-card <shows|prayers|forecast|matches|verse|none>  # on the home screen (default none)
optimize/dock.sh apps                             # then: optimize/dock.sh set <pkg> <pkg> ...  (favourites, left to right, 5–10)
optimize/saver.sh update
optimize/saver.sh show ; optimize/dock.sh show    # confirm with me
```
Ask me after how many minutes the screensaver should start, then
`optimize/venv/bin/python -I optimize/tv.py "settings put system screen_off_timeout <minutes × 60000>"`.

## 5. Check (5 minutes)

```
optimize/shot.sh home
optimize/shot.sh screensaver
```
Look at both screenshots (in `optimize/run/shots/`) and describe them to me. Then with me: press Home inside an
app (it must come back to the new home), and try AirPlay or Cast from a phone once.

## 6. Tell me

- The before/after table from `optimize/run/report.md` and its feature check.
- What was disabled, my settings, and anything that looked wrong.
- Undo, any time: `optimize/reset.sh`.
