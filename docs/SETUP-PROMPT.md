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

## 1. Connect and look (5 minutes)

```
git clone https://github.com/tshi-dev/TV-ScreenSaver && cd TV-ScreenSaver
optimize/setup.sh
optimize/find-tv.sh                       # accept "Allow USB debugging?" on the TV, tick "Always allow"
optimize/venv/bin/python -I optimize/tv.py --probe
optimize/shot.sh home my-apps
```
Tell me the model and Android version. Look at `optimize/run/shots/my-apps.png` and write down the first **6 apps**
of my apps / favourites row, left to right, by name: they become the favourites of the new home screen in step 4.
Only then, if this TV was set up with these tools before (also older versions, whose apps are `com.abdullah.*`),
run `optimize/reset.sh` so we start like new.

## 2. My choices (5 minutes, with me, all at once so the rest runs on its own)

Ask me these together, in plain Arabic, and write the answers down:
1. **My city** (for prayer times, weather and the clock line).
2. **My favourite clubs** — and national team — whose games I want to follow (up to 10, most important first).
3. **Beside the clock on the screensaver:** «آية أو حديث اليوم», «جديد المسلسلات», «مواقيت الصلاة اليوم»,
   «طقس الأيام القادمة», «مباريات فرقي القادمة», or nothing. If episodes: which genres and languages I like.
4. **The same card on the home screen too?** (off unless I say so)
5. **After how many minutes** the screensaver should start.
6. **What I never use**, from `optimize/lists/tcl-optional.txt`, group by group in plain words (the TCL tab and
   channels, the game bar, T-Cast, accessory updates, Google TV / Play Movies, YouTube Music, region leftovers).
   Copy the package lines of what I give up into `optimize/lists/mine.txt`; if I keep everything, skip it.

Read my 6 apps from step 1 back to me and let me swap any.

## 3. Run it (20–30 minutes, the TV restarts twice)

```
optimize/run.sh
```
It saves the TV's state, measures memory and the TV's own screensaver, disables telemetry/ads/demos and my picks,
applies the speed and memory tweaks, installs the screensaver and the home screen (behind the safety switch),
measures again and writes `optimize/run/report.md`. If it stops for any reason: `optimize/run.sh` again (it
continues), and `optimize/run.sh status` shows where it is.

If the home-screen step says Home did not switch, leave the TV alone for 5 minutes (the stock home comes back by
itself) and tell me. Some TCL firmware keeps its own home: then `SKIP_LAUNCHER=1 optimize/run.sh`.

## 4. Apply my choices (5 minutes; no remote needed)

```
optimize/saver.sh cities                          # find my city, then: optimize/saver.sh city <name>   (or: city <name> <lat> <lon>)
optimize/saver.sh find-team <club>                # for each club, then: optimize/saver.sh teams <id:Name> <id:Name> ...  (my order)
optimize/saver.sh card <verse|shows|prayers|forecast|matches|none>        # beside the clock
optimize/saver.sh home-card <verse|shows|prayers|forecast|matches|none>   # home screen (none unless I said yes)
optimize/dock.sh apps                             # match my 6 apps to packages, then: optimize/dock.sh set <pkg> ... (in my order)
optimize/venv/bin/python -I optimize/tv.py "settings put system screen_off_timeout <minutes × 60000>"
optimize/saver.sh update
optimize/saver.sh show ; optimize/dock.sh show    # read it back to me
```
If I chose episodes: `optimize/saver.sh genres <Drama,Comedy,...>` and `optimize/saver.sh langs <Arabic,English,...>`
(only what I asked for; nothing = all). `optimize/saver.sh` without arguments lists the names.

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
