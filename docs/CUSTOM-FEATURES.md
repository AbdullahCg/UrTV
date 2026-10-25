# Custom features and attribution

Based on [tshi-dev/UrTV](https://github.com/tshi-dev/UrTV).

Integrated runtime changes from [Emadalnazawi/UrTV](https://github.com/Emadalnazawi/UrTV), branch `emad`, through commit `9ba127e8ba9fb84599b3dc12f50f07f8bb9f1a55`:

- Right-to-left favourites and application rows, with matching remote focus order.
- Icon-only top buttons which expand on focus, softer animations and transitions.
- Home Assistant notifications in home-screen and screensaver cards.
- A notification companion app (`sa.urtv.notify`) supporting Notifications for Android TV / Fire TV (port 7676) and PiPup JSON (port 7979), images and camera/video pop-ups.

Notification endpoints are intended for a trusted home LAN, as in the source fork. Do not expose them to the internet. Configure the TV address in your own Home Assistant instance; no Home Assistant account or server settings are bundled here. Install the companion with `optimize/install.sh notify`; it grants the overlay app-op for pop-ups over other apps. Its status page shows ports and a test button.

Added locally:

- [Independent app PINs and a master settings/recovery PIN](APP-LOCKS.md), with an optional Accessibility gate for voice-search and other external app launches.
- English digits (0–9) for the home clock/date, screensaver, market prices, prayer times and match scores, while retaining Arabic labels.
- Numeric TASI and S&P 500 index levels and Bitcoin USD price with provider timestamps, refreshed every 15 minutes. These are latest available provider quotes, not a real-time exchange feed. Offline refresh retains the prior quote and its original timestamp.
- Local APK installation (`LOCAL_APK_DIR=path optimize/install.sh all`) using the original launcher's safety switch.
- Local page auto-update off by default so upstream HTML cannot overwrite the custom ticker; the data refresh schedules continue to work.

The automatic upstream-sync workflow from the source fork is deliberately not included: it would overwrite custom pages and controls. The Android build workflow includes all three APKs. Configure your own repository signing secrets before running release automation. Local builds use the standard local Android development key when no release key is supplied; all three APKs must use the same key for signature-protected communication.

## Build

Use Java 17, Gradle 8.9 and Android SDK 34. Build the pages with `python src/build.py`, then run `gradle -p android assembleRelease`. Set `GITHUB_RUN_NUMBER` to a version code newer than the installed build. Optional `URTV_REPO`, `URTV_BRANCH` and `URTV_VERSION_BASE` configure a fork's hosted assets/version offset. For production release builds, set `ANDROID_KEYSTORE` and `ANDROID_KEYSTORE_PASSWORD` using your own key.

No private signing keys, PINs, personal TV settings, network addresses, screenshots, local SDK downloads or device backups belong in the published source.
