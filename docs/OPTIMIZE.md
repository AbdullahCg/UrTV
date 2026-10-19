# Optimizing a TCL Google TV / Android TV — what we learned

From hands-on work on three TCL sets (Android 11, 12 and 14, 1.7–2.3 GB RAM, 32-bit). The tools are in `optimize/`.

## What works

| Change | Effect | How |
|---|---|---|
| Disable TCL/Google telemetry, promos and demos | +85 to +215 MB free RAM, nothing lost | `optimize/lists/tcl-safe.txt` |
| Restrict the Play Store in the background (never disable it) | its idle CPU fell from ~31% to ~6% on one set; the app still opens and updates | `optimize/tweaks.sh apply` |
| Animations at 0.5× | menus feel faster | `optimize/tweaks.sh apply` |
| Free storage | a set at 96–100% full was slow everywhere; app download folders (e.g. a video app's offline downloads) were the cause | check `df /sdcard` and `du -sh /sdcard/Android/data/*`; ask before deleting anything |

Judge results by `MemAvailable`, the Play Store's CPU and how the remote feels — not by load average,
which sits high on these sets from I/O wait even when idle.

## What must stay on

`optimize/lists/keep.txt`, enforced by `disable.sh`. In short: **AirPlay, Chromecast, screen mirroring, voice
assistant, the remote and keyboard, HDMI inputs and the tuner, the quick panel, firmware updates, the Play Store,
WebView and Google services.** One set had AirPlay, mirroring and voice disabled; those were mistakes.

## The black screen (what not to do)

Disabling the stock home (`launcherx` or `tvlauncher`) **and** the setup app (`setupwraith`) with no working
replacement leaves the TV with no home: black screen, reboot loop, and Wi-Fi did not come up for ~10 minutes,
so ADB was gone too. Recovery needed someone at the TV to rejoin Wi-Fi from the remote.

The safe way, built into `optimize/install.sh launcher`:
1. Install the new home first.
2. Start `optimize/deadman.sh` on the TV: unless `/data/local/tmp/home_ok` appears within 180 s it re-enables
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
