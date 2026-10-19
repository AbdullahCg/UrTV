# Prompt: set up the TV (screensaver + optimize + launcher)

Run this with a coding agent (Claude Code or similar) **on a computer on the same Wi-Fi as the TV**.

**First, on the TV:** Settings → System → About → press OK on **Build** 7 times → back → Developer options → turn on
**USB debugging** (and **Network debugging** if listed). Keep the TV on.

Then clone the repo and start the agent inside it:

```bash
git clone https://github.com/tshi-dev/TV-ScreenSaver && cd TV-ScreenSaver
```

Paste everything below the line.

---

You are setting up my Android TV / Google TV with three things from this repository. Read `README.md`,
`optimize/` and `docs/TEST-PLAN.md` first. Talk to me in Arabic; keep commands in English.

**Rules**
- Back up before changing anything (`optimize/backup.sh`) and keep the file.
- Everything must be reversible: disable packages, never uninstall system apps. Give me the exact undo command at the end.
- Before disabling anything, run `optimize/check-packages.py` on the list. Never disable a package UAD-ng rates **Unsafe**.
  Treat **unknown** as "ask me".
- Ask me before removing a feature I might use: Chromecast/casting (`com.google.android.apps.mediashell`), screen mirroring,
  USB media player, the TV's own apps, voice assistant.
- After every step take a screenshot from the TV (`optimize/venv/bin/python -I optimize/tv.py --shot step.png`), look at it,
  and confirm the step worked before moving on.
- If something fails, stop, show me the output and propose a fix. Don't guess.

**0. Connect**
1. `optimize/setup.sh`, then `optimize/find-tv.sh`. Accept "Allow USB debugging?" on the TV when it appears.
2. `optimize/venv/bin/python -I optimize/tv.py --probe` and tell me the model and Android version.
3. `optimize/backup.sh`.

**1. Optimize**
1. List the installed packages, then build a debloat list for this TV in `optimize/lists/<brand-model>.txt`.
   Start from `optimize/lists/tcl-google-tv.txt` if it is a TCL; otherwise search GitHub for a debloat list for this
   brand/model and cite the source in the file's header. Ask me about each group as described above.
2. `optimize/venv/bin/python -I optimize/check-packages.py optimize/lists/<file>` and show me anything not "Recommended".
3. `optimize/disable.sh optimize/lists/<file>`, then `optimize/tweaks.sh apply`.
4. Measure before/after: `dumpsys meminfo | head -40` and the home screen's memory. Report the numbers.

**2. Screensaver (شاشة السعودية)**
1. `optimize/install.sh saver`. Its settings open on the TV: set city, team 1 and team 2 with me.
2. Set the TV's screensaver timeout with me (Settings → Screensaver), then start it to check
   (`am start -n com.android.systemui/.Somnambulator` or wait).
3. Run sections B, D and E of `docs/TEST-PLAN.md`.

**3. Launcher (home screen)**
1. Ask me which apps go in the dock, in order. Look up their package names on the TV and edit
   `android/launcher/src/main/res/values/config.xml` (`dock_apps`, `hidden_apps`, `live_tv_package`).
   If you changed it, commit on a branch, open a pull request, and wait for the "Build APKs" check to pass.
   Then ask me to merge, so the `apk-latest` release has the new `tvhome.apk`.
2. `optimize/install.sh launcher`.
3. Test: press Home from inside an app (it must come back to our home, not the stock one), D-pad through the dock
   and the full app grid, open المصادر (inputs), واي فاي, الإعدادات and شاشة التوقف.

**Report** (send me this, I'll pass it to the developer)
- TV model / Android version, what was disabled, memory before/after.
- PASS/FAIL table for every step with screenshots of the home screen, the screensaver and any failure.
- My feedback, in my own words.
- The exact undo commands: `optimize/restore.sh optimize/lists/<file>` and `optimize/tweaks.sh restore`.
