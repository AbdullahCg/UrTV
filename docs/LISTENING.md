# استماع (listening) — Quran recitations and live radio

An **opt-in** Android TV app, separate from the screensaver and the home screen. It plays the Quran
only: ten reciters' Hafs murattal (114 surahs each) and live Quran radio. There is no local/USB
music, no Spotify or YouTube Music, no account, no ads and no analytics.

Package `sa.urtv.listening` · APK `urtv-listening.apk` · label «استماع» · minSdk 21, targetSdk 34.

## Install

```bash
optimize/install.sh music     # just this app; does not touch Home or the screensaver
optimize/install.sh all       # the screensaver, the home screen and this app
```

On Windows, run the same command in Git Bash: `optimize/setup.sh` makes `optimize/venv/bin/python` a wrapper
around `venv\Scripts\python.exe`, and `optimize/tv.py` repairs Git Bash's path rewrite.

The APK is also on the [`apk-latest` release](https://github.com/tshi-dev/UrTV/releases/tag/apk-latest);
install it with `adb install urtv-listening.apk`. Uninstall with `adb uninstall sa.urtv.listening`
(or `optimize/reset.sh`, which removes all three apps).

## Screens and remote

- **Home**: «متابعة الاستماع» when there is something to resume, then «القرّاء» and the ten reciters,
  then «الإذاعات» and the live stations. The selected row has a solid dark card, a thick gold frame
  and a gold chevron at the end, so it is visible from the couch.
- **Surah grid**: the 114 surahs in reading order, right to left; OK opens the player.
- **Player**: title, reciter/station, progress, and a transport row. The transport controls stay
  left-to-right (previous, play/pause, next) with universal icons; the rest of the screen is RTL.

| Key | Action |
|---|---|
| OK / Enter | play / pause |
| ◀ / ▶ | seek −10 s / +10 s |
| ▼ | sleep timer (30, 60 or 90 minutes; off; stop now) |
| Back | back to the list — playback continues |
| media play/pause, next, previous | work through the media session |

The sleep timer fades the volume out at the end and shows the remaining minutes in gold on the
player. On Android 13+ the app asks for the notification permission on first launch; playback
works without it but the media notification is hidden.

## Playback behaviour

- A foreground `MusicService` with a `MediaSession` keeps playing while the app is in the background
  or the TV screensaver is on. It holds a Wi-Fi lock so a live stream does not die when the screen
  sleeps, and it uses audio focus (another app's sound pauses it, then it resumes).
- The position is saved every 5 s and when pausing; reopening the app offers «متابعة الاستماع» at
  that position. A finished surah advances to the next one; after An-Nas it wraps to Al-Fatiha.
- A network error retries the same URL twice, three seconds apart, then shows «تعذر الاتصال». For a
  surah, the retry resumes near the last position instead of restarting the surah.
- Pausing a live station pauses the stream; resuming starts it again (a live stream continues at the
  live edge). Pressing play after a stream has ended reconnects.

## Control it over ADB

`optimize/music.sh` wraps the app's shell-only broadcast receiver (the receiver requires
`android.permission.DUMP`, so only the ADB shell can send it — other apps cannot):

```bash
optimize/music.sh status
optimize/music.sh reciters                 # ids for the next command
optimize/music.sh stations                 # indices for the next command
optimize/music.sh surah sudais 1           # Al-Fatiha by Sudais
optimize/music.sh radio 0                  # Saudi Quran Radio
optimize/music.sh pause | resume | toggle | next | prev | stop
optimize/music.sh seek -10                 # 10 seconds back
optimize/music.sh sleep 30                 # 0 cancels
```

`status` prints one line:

```
playing=1|source=surah|reciter=sudais|reciter_name=عبدالرحمن السديس|surah=1|surah_name=الفاتحة|station=-1|station_name=|pos=12400|dur=36075|sleep=0|error=
```

The raw broadcasts are the same actions:

```bash
adb shell am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.GET
adb shell am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.PLAY_SURAH --es reciter sudais --ei surah 1
adb shell am broadcast -n sa.urtv.listening/.MusicReceiver -a sa.urtv.listening.PLAY_RADIO --ei station 0
```

## Catalog

The catalog is generated and committed, so the app builds and starts offline:

```bash
python3 .github/tools/fetch_quran.py           # regenerate the three JSON files
python3 .github/tools/fetch_quran.py --check   # ranged GET of every stream URL
```

- **Reciters** are the ten curated Hafs murattal entries from [mp3quran.net](https://mp3quran.net);
  the app builds `server + 001.mp3 … 114.mp3` from the server field.
- **Surahs** come from [api.alquran.cloud](https://alquran.cloud); names are stripped of the
  «سُورَةُ» prefix, vowel marks and tatweel.
- **Stations** are eleven live streams from mp3quran/qurango.net, with the Saudi Quran Radio first.
- Streams move or go quiet; the `--check` run verifies one kilobyte of each URL. At the time of
  writing all 21 URLs answered with `audio/mpeg`. A station that fails may be temporarily down;
  the app retries and reports it.

The assets live in `android/listening/src/main/assets/quran/` (`reciters.json`, `stations.json`,
`surahs.json`). `tests/listening_test.py` checks the catalog, the cleartext scope and the manifest.

## Network and privacy

- Runtime requests are only the audio streams and their redirects. The catalog is bundled; there
  is no API call, account, upload, analytics or ad SDK.
- `res/xml/network_security_config.xml` sets `cleartextTrafficPermitted="false"` globally. The Saudi
  Quran Radio (`stream.radiojar.com`) redirects to its CDN over `http://n0X.radiojar.com`; cleartext
  is allowed only for `radiojar.com` and its subdomains. Nothing else may use HTTP.
- Permissions: internet, network/Wi-Fi state (Wi-Fi lock), wake lock, foreground media playback and
  notifications. There is no storage permission and no access to local media.

## Build and test

```bash
# with JDK 17 and an Android SDK with platform 34
gradle -p android :listening:assembleRelease
python3 tests/listening_test.py
```

CI builds the module with the other two apps, renames the APK to `urtv-listening.apk` and publishes
it to `apk-latest` and the numbered `v3.N` releases. The release key comes from the repository's
`ANDROID_KEYSTORE` secret and is the same for all three apps; a local build without it uses the debug
key, so it cannot update a release install. The listening app is a separate package with its own data.

## Known limits

- Live streams depend on third parties; a station can be down, move, or be blocked on some networks.
- No downloads/offline mode and no local files, by design.
- The UI is Arabic/RTL; the transport buttons are intentionally LTR so the previous/next arrows match
  every other player.
- The first launch after a TV power cut may take a moment while Android unfreezes the app (a TCL
  quirk; the same applies to the screensaver).
