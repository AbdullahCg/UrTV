# Optimizing a TCL Google TV / Android TV — what we learned

From hands-on work on three TCL sets (Android 11, 12 and 14, 1.7–2.3 GB RAM, 32-bit). The tools are in `optimize/`.

## What works

| Change | Effect | How |
|---|---|---|
| Disable TCL/Google telemetry, promos and demos | +85 to +215 MB free RAM, nothing lost | `optimize/lists/tcl-safe.txt` |
| Restrict the Play Store in the background (never disable it) | its idle CPU fell from ~31% to ~6% on one set; the app still opens and updates | `optimize/tweaks.sh apply` |
| Animations at 0.5× | menus feel faster | `optimize/tweaks.sh apply` |
| Cached apps frozen (no CPU in the background); Android's own limit on how many closed apps stay in memory | apps reopen fast. Lowering the limit to 16 (`CACHED_LIMIT=16`) is off until measured again: Android 14 raised it on purpose (up to 30% fewer cold starts); a TCL Google TV (Android 14) boots with 1024, and there the lowered setting was gone after a restart, so the first after-measurements ran without it | `optimize/tweaks.sh apply` (`restore` undoes it) |
| The stock home's helpers off once our home screen works (`tclhome_passive` ~80 MB) | dead weight with another home screen | done by `optimize/install.sh launcher` after the check; `optimize/restore.sh` re-enables |
| Free storage | a set at 96–100% full was slow everywhere; app download folders (e.g. a video app's offline downloads) were the cause | check `df /sdcard` and `du -sh /sdcard/Android/data/*`; ask before deleting anything |

Judge results by `MemAvailable`, the Play Store's CPU and how the remote feels — not by load average,
which sits high on these sets from I/O wait even when idle.

## Running it

`optimize/run.sh` does the whole setup in order and remembers each finished step: over slow or dropping ADB just
run it again. Results go to `optimize/run/` (before/after table in `summary.md`, `report.md`). `optimize/reset.sh`
puts a TV back as it came, including older versions of these apps. The ADB client (`optimize/tv.py`) retries and
reconnects by itself, uploads APKs in verified pieces that resume after a drop, and restarts the TV only through
`tv.py --reboot` (sent once, so a retry can never restart it twice).

## What must stay on

`optimize/lists/keep.txt`, enforced by `disable.sh`. In short: **AirPlay, Chromecast, screen mirroring, voice
assistant, the remote and keyboard, HDMI inputs and the tuner, the quick panel, firmware updates, the Play Store,
WebView and Google services.** One set had AirPlay, mirroring and voice disabled; those were mistakes. A set
optimized before still had voice, mirroring and firmware updates off after a reset, so `optimize/keep.sh` turns
everything in keep.txt back on; `run.sh` and `reset.sh` run it.

## Home screen problems (what we have seen, and the fix)

TCL puts Home back on its own launcher at every boot, so ours only stays home while the stock launcher is
disabled. That is why switching is risky: if ours is gone or broken while the stock one is off, the TV has no home.

| What you see | Why | Fix |
|---|---|---|
| Black screen, reboot loop, Wi-Fi gone for ~10 minutes (so ADB too) | the stock home (`launcherx` or `tvlauncher`) and the setup app (`setupwraith`) were disabled with no working replacement (3 October, before these tools) | someone at the TV rejoins Wi-Fi with the remote, then `optimize/restore.sh`. Prevented by `install.sh launcher`, below |
| No home at all after our home app was removed: black screen, Home does nothing | ours was the only home enabled: removed by hand, or replaced by a build signed with another key | `optimize/restore.sh` (no list: only the home screen), then `optimize/install.sh launcher`. Since the move to the new signing key (October), `install.sh` turns the stock home on before it replaces a home app signed with another key |
| Our home is installed, but Home opens Google TV | ADB was slower than the 5-minute safety switch, which put the stock home back (`!! The safety switch put the stock home back`) | `optimize/install.sh launcher` again |
| The same, twice: `!! Home did not open the new launcher` | firmware that pins Home to the stock launcher (HOME priorities not honoured, the boot manager starts the stock home) | keep the stock home: `SKIP_LAUNCHER=1 optimize/run.sh`; open تلفزيونك from the apps row |
| Google TV home and none of our apps, after `optimize/reset.sh` | that is what reset does | set up again from the prompt |

The safe way to switch, built into `optimize/install.sh launcher`:
1. Install the new home first.
2. Start `optimize/deadman.sh` on the TV: unless `/data/local/tmp/home_ok` appears within 300 s it re-enables
   the stock home and the setup app and presses Home.
3. Disable the setup app, then the stock home (this order avoided the black screen).
4. Press Home and check the new launcher is in front (3 tries); only then create `home_ok`, and confirm the safety
   switch hadn't already fired.

## TCL quirks

- After a reboot TCL keeps third-party apps frozen until they are opened once: boot broadcasts don't arrive and
  the first screensaver start can hang. Open شاشة تلفزيونك once after a power cut.
- Disabling a package is per user and reversible: `pm enable <package>`. Don't `pm uninstall` system apps.
- Remote access tools (VPNs etc.) that are put in the restricted bucket stop reconnecting after a reboot — only
  restrict them once remote access is no longer needed.
