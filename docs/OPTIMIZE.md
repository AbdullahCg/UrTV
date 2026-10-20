# Optimizing a TCL Google TV / Android TV — what we learned

From hands-on work on three TCL sets (Android 11, 12 and 14, 1.7–2.3 GB RAM, 32-bit). The tools are in `optimize/`.

## What works

| Change | Effect | How |
|---|---|---|
| Disable TCL/Google telemetry, promos and demos | +85 to +215 MB free RAM, nothing lost | `optimize/lists/tcl-safe.txt` |
| Restrict the Play Store in the background (never disable it) | its idle CPU fell from ~31% to ~6% on one set; the app still opens and updates | `optimize/tweaks.sh apply` |
| Animations at 0.5× | menus feel faster | `optimize/tweaks.sh apply` |
| Cached apps frozen (no CPU in the background); Android's own limit on how many closed apps stay in memory | apps reopen fast. Lowering the limit to 16 (`CACHED_LIMIT=16`) is off until measured again: Android 14 raised it on purpose (up to 30% fewer cold starts) | `optimize/tweaks.sh apply` (`restore` undoes it) |
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

## The black screen (what not to do)

Disabling the stock home (`launcherx` or `tvlauncher`) **and** the setup app (`setupwraith`) with no working
replacement leaves the TV with no home: black screen, reboot loop, and Wi-Fi did not come up for ~10 minutes,
so ADB was gone too. Recovery needed someone at the TV to rejoin Wi-Fi from the remote.

The safe way, built into `optimize/install.sh launcher`:
1. Install the new home first.
2. Start `optimize/deadman.sh` on the TV: unless `/data/local/tmp/home_ok` appears within 300 s it re-enables
   the stock home and the setup app and presses Home.
3. Disable the setup app, then the stock home.
4. Press Home and check the new launcher is in front; only then create `home_ok`.

Some TCL firmware pins Home to the stock launcher (HOME intent priorities are not honoured and the boot manager
starts the stock home). On those sets keep the stock home and open the new launcher from the app row instead.

## TCL quirks

- After a reboot TCL keeps third-party apps frozen until they are opened once: boot broadcasts don't arrive and
  the first screensaver start can hang. Open شاشة تلفزيونك once after a power cut.
- Disabling a package is per user and reversible: `pm enable <package>`. Don't `pm uninstall` system apps.
- Remote access tools (VPNs etc.) that are put in the restricted bucket stop reconnecting after a reboot — only
  restrict them once remote access is no longer needed.
