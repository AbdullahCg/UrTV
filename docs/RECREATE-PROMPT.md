# Saudi TV Screensaver — Recreate Prompt

Paste everything below the line into any capable AI (Claude, GPT, Gemini) that can write a single HTML file. It will rebuild the screen from scratch.

---

## Goal

Build ONE self-contained HTML file (no build step, no external JS libraries) that runs full-screen on a 16:9 TV at 1920×1080 as an always-on screensaver. Arabic only, right-to-left, Riyadh. It must look like a premium Saudi editorial broadcast graphic — photographic and calm, never like a generic dark "dashboard".

## Layout (1920×1080)

One grid with three rows — `grid-template-rows: auto 1fr auto`, stage padding `3.1vh 3.6vw 5.4vh`, row gap `1.5vh`.

**Top row — two ends, nothing in between:**
- Left: four compact chips in a row. Each: 1px border `rgba(220,184,111,.22)`, background `rgba(4,14,9,.60)`, 7px backdrop blur, 10px radius, padding `.8vh .95vw`.
  - TASI, S&P 500, Bitcoin: the name plus ONE direction marker only — `▲` in `#79D6A0` if up, `▼` in `#EE8B70` if down. No price, no percentage.
  - If a quote cannot be loaded, hide that marker completely (`display:none`). Never show a dash, never show a hard-coded direction.
  - Weather chip: `الرياض`, the temperature as `٣٤°`, and a short Arabic condition word (`صافي`, `غائم جزئياً`, `مطر`…).
  - Chips size to their content — no `min-width`, no empty air inside.
- Right: Hijri date (large, sand `#F6EFE0`) over the Gregorian date (smaller, muted `#C6BBA4`), then a short gold hairline fading out to the left.

**Middle row — clock right, shows left:**
- Clock pushed to the right edge, `font-size: clamp(120px, min(17vw, 31vh), 345px)` (≈300px tall), `line-height .92`, `letter-spacing .022em` — slightly positive so the digits breathe. 12-hour, Arabic-Indic digits, gold colon, and a small gold `ص`/`م` at `.28em` at the upper left of the time. Under it a tiny muted line `بتوقيت الرياض`.
- "New this week" card on the left: translucent panel (`rgba(4,14,9,.46)`, 1px gold border, radius 12, backdrop blur), `max-width: min(760px, 48vw)`, justified to the left edge of its column.
  - Header `هذا الأسبوع` with a gold rule fading out to the left.
  - Exactly 5 rows, each a single flex line: show name (right, `flex:0 1 auto; max-width:68%`, ellipsis), then `الموسم ٣ · ح ٧`, then the rating `٨٫١`, then the weekday anchored at the far left (`flex:1 1 auto; text-align:left`). Hairline under every row.
  - Pool of up to 50 titles, 5 per page, a new page every 25 seconds with a staggered fade-up (`opacity` + `translateY(8px)`, 60ms per row) and wraparound at the end.

**Bottom row — three panels under one gold hairline, `grid-template-columns: 1fr .9fr 1.3fr`, `align-items:end`:**
All three are built identically — small gold label, big value, small sub-line — and must read as one set: same sizes, same baseline.
- Right: `الصلاة القادمة` → `الفجر ٥:٣٥ ص` as one big value, sub-line `بعد ٣ ساعات و ٣٧ دقيقة`.
- Centre: `رمضان ١٤٤٨` → the day count at `1.3em` with `يوم` at `.4em` in gold beside it, sub-line the estimated start date.
  - This is the classic bug: keep number and unit in one inline line and give the unit `display:inline-block; transform:translateY(-.8em)` so it lands beside the number instead of dropping underneath and colliding with the sub-line.
- Left: `المباريات` → `الهلال × الحزم` big, sub-line `بعد ٢٠ ساعة · ٩:٠٠ م`. Nothing inside the coming week → `لا شيء هذا الأسبوع` in muted sand at the same size, never an empty box.

## Visual direction

- Background: a real dusk desert photograph (sand dunes, sun low, empty sky, deep shadows), not CSS gradients. Darken with a vertical scrim top and bottom, a soft vignette, and film grain at 4–5% opacity. 120-second ultra-slow scale-and-drift on the photo.
- Palette: sand `#F6EFE0`, warm gold `#C8A45C` / `#D6AF6B`, near-black green `#04120C`, muted text `#C6BBA4`.
- Heavy soft drop shadows behind the clock and big values so they stay legible over the photo.
- No English labels on screen, no emoji, no box around the clock.

## Typography

- Use **Thmanyah** (free, https://font.thmanyah.com). Download the ZIP and embed the weights as base64 `@font-face` so the file works offline: **Sans Light + Regular + Medium** for labels and body, **Serif Display Bold** for the clock, the big values and the empty-match state.
- If Thmanyah is unavailable: body in a low-contrast humanist Arabic sans, clock and numbers in an Arabic display serif with tall, high-contrast digits.
- Arabic-Indic numerals everywhere (`٦٧٧٢٧٣٦٤٧٢`), including the Gregorian date, temperatures, ratings and countdowns. Decimal separator `٫` (U+066B).
- Arabic counted-noun grammar: `١ ساعة`, `ساعتين`, `٣ ساعات` … `١١ ساعة`; same pattern for `يوم` and `دقيقة`.
- All sizes in `clamp()` with `vw`/`vh` — it must still hold together at 1280×720.

## Data (all free, no API keys)

- **Prayer times** — Aladhan, method 4 (Umm al-Qura):
  `https://api.aladhan.com/v1/timings/DD-MM-YYYY?latitude=24.7136&longitude=46.6753&method=4&timezonestring=Asia/Riyadh`
  Only Fajr, Dhuhr, Asr, Maghrib, Isha. Refresh every 6 hours; recompute the countdown every second.
- **Ramadan** — never hard-code the date: walk forward day by day with
  `Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{timeZone:'Asia/Riyadh',month:'numeric'})` until the month equals 9.
  Cache the answer per calendar day — that 400-day search must not run once per second.
- **Hijri date** — `Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{timeZone:'Asia/Riyadh',weekday:'long',day:'numeric',month:'long',year:'numeric'})`, strip a trailing `هـ` before appending your own. The Ramadan panel's year must also be derived, never a literal `١٤٤٨`.
- **Markets** — Yahoo chart API:
  `https://query1.finance.yahoo.com/v8/finance/chart/{^TASI.SR|^GSPC}?interval=1d&range=5d`
  Compare `regularMarketPrice` with the previous close; only the sign matters. Refresh every 15 minutes.
  Yahoo sends no CORS headers, so a browser cannot call it directly: try it once, and on failure fetch the same URL through `https://api.allorigins.win/get?url=<encoded>` and `JSON.parse(response.contents)`. If both fail, hide the arrow. Allow up to ~30 seconds on first load.
  Bitcoin uses CoinGecko instead (it does send CORS headers):
  `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`
  Mind the spelling: the query parameter is `include_24hr_change` but the response key is `usd_24h_change` (no `r`) — accept both.
- **Weather** — Open-Meteo:
  `https://api.open-meteo.com/v1/forecast?latitude=24.7136&longitude=46.6753&current=temperature_2m,weather_code&timezone=Asia/Riyadh`
  Map the WMO `weather_code` to a short Arabic phrase. Refresh every 30 minutes.
- **Premieres** — TVMaze schedules:
  `https://api.tvmaze.com/schedule?country=US&date=YYYY-MM-DD` and `https://api.tvmaze.com/schedule/web?date=YYYY-MM-DD`, for each of the next 7 days.
  Keep `rating.average >= 7`, drop soaps (`genres` includes `Soap`), drop seasons above 15 and any entry without an episode number, dedupe by show name, cap the pool at 50, premieres first then by date.
- **Fixtures** — TheSportsDB test key `123`:
  `eventsnext.php?id=136013` (Al-Hilal) and `?id=136137` (Saudi national team); `eventslast.php?id=…` for results.
  `strTimestamp` has no offset — append `Z`, then render in `Asia/Riyadh`.

## Behaviour

- **Match result window:** once a fixture ends (kickoff + 2.5h), replace the upcoming fixture with the final score (`الهلال ٣ - ٢ الاتحاد`, sub-line `النتيجة النهائية · الأحد`) and keep it for 24 hours, then fall back to the next fixture.
- **Ramadan mode:** when the Hijri month is 9 the centre panel stops counting down and becomes `الإفطار` with the Maghrib time and the time left; between Maghrib and Fajr it becomes `الإمساك` with the Fajr time.
- **Night dimming:** a full-screen black overlay, transparent from 07:00 to 21:00, ramping over two hours either side, sitting at 46% between 23:00 and 05:00. Recompute every minute.
- **Burn-in protection:** shift the content layer a few pixels through a fixed 7-step sequence every 4 minutes, with a 3-second transition.
- **Daily background:** seven licensed Saudi landscapes (AlUla, Riyadh, Tabuk dunes, Farasan coast, Asir mountains, Diriyah, Jeddah at night) stored as base64 in a `BGS` array; pick one per **Riyadh calendar day** with a deterministic hash of the `YYYY-MM-DD` key, so the photo is stable all day and advances at midnight. Give each entry its own brightness factor (0.80–1.0) so bright sand or water never hurts the white text, and print `الصورة: <photographer> · <licence>` in 10 px at 30% opacity in the bottom corner.
- **Midnight rollover:** at Riyadh 00:00 reload the day-dependent data (prayers, week list, matches, weather). A 6-hour interval alone leaves yesterday's premieres on screen.
- Clock ticks every second (one Intl call); dates, prayer, Ramadan and countdowns refresh every 15 seconds. Zero layout shift. Hide the cursor, block scrolling and selection. `F` toggles fullscreen.

## Hard requirements

- Every fetch in `try/catch` with a fallback. With no network the screen still shows the correct clock, both dates, the Ramadan countdown, a prayer countdown and the known fixture — never a blank cell, never an uncaught error.
- Never fabricate data. If a live value is missing, hide it — never present a hard-coded number as if it were current.
- On a failed refresh keep the last known data (week pool, fixtures, results) instead of blanking the panel.
- Numbers read left-to-right: build the clock from separate spans inside a `direction:ltr` container, or Arabic-Indic digits render in reverse.
- Every API-sourced name (teams, show titles) needs `nowrap` + ellipsis and a `min-width:0` parent, so a long title can never push its neighbour or the panel edge.
- Every `Intl.DateTimeFormat` that puts a weekday or date on screen must pass `timeZone:'Asia/Riyadh'`.
- Do countdown maths from `Intl.DateTimeFormat(...).formatToParts()` (hour × 60 + minute + second/60) instead of rebuilding a `Date` from wall-clock parts — the device timezone must not matter.
- A `CONFIG` object at the top of the script: city, latitude, longitude, timezone, prayer method, team ids, keys.
- Final deliverable: one `.html` with fonts and image inlined as base64, openable by double-click on a TV browser with no server.

## The Android app (what we actually shipped)

- A native `DreamService` APK, not a browser page: the assets live inside the APK, so there is no white flash and no browser chrome, and it works offline.
- `MainActivity` is a full-screen WebView showing the same HTML; dismiss with any remote key via `dispatchKeyEvent`.
- `ScreenDream` is the system dream (`screensaver_components=com.abdullah.tvsaver/.ScreenDream`), so it starts on the TV's own idle timer (10 s).
- **Settings inside the app:** a city picker (`SettingsActivity`, 23 Saudi cities) writes the choice to SharedPreferences; every dashboard load builds `file:///android_asset/ksa-dashboard.html#city=..&lat=..&lon=..&tz=..` and the page reads the **fragment** with `new URLSearchParams(location.hash.slice(1))`. A `?query` on a `file://` asset URL fails to load in WebView, the fragment works.
- **Team preferences:** the same settings screen has two team fields (TheSportsDB ids) and appends `&team1=136013&team2=136137` to the fragment. Each team owns one slot in the fixtures panel; a team with nothing this week (or an empty field) leaves its slot hidden, and a game between the two shows once.
- Weather, prayer times, the clock timezone and the "بتوقيت …" label all follow the chosen city; Riyadh is the fallback.
- Pass the config in the fragment and the page stays a plain static HTML file that still opens on a desktop browser.
- TCL quirk: after a reboot the app is frozen until it is opened once, and the first dream attempt fails (`mCurrentDream=null` while the system is `Dreaming`). A `BOOT_COMPLETED` receiver does not fire on this TV. Expect one manual open after a power cycle.
- Build without Gradle: `aapt2 compile` -> `aapt2 link` -> `javac --release 8` -> `d8` -> `zipalign` -> `apksigner`. Recompile resources whenever a string changes.
