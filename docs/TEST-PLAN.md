# Test plan — شاشة تلفزيونك

For a tester (human or agent) with a Linux/macOS machine, `adb`, and an Android TV on the same network.
Every step has an exact action and the expected result. Record **PASS / FAIL + note + screenshot** for each ID.

Screenshots: `adb exec-out screencap -p > ID.png`
Logs on failure: `adb logcat -d -t 300 | grep -iE "tvsaver|chromium|AndroidRuntime" > ID.log`

---

## 0. Setup

| ID | Action | Expected |
|---|---|---|
| S1 | On the TV: Settings → Device preferences → About → press Build 7× → Developer options → enable **USB/Network debugging**. Note the TV's IP. | Debugging on |
| S2 | `adb connect <TV_IP>:5555` then `adb devices` | Device listed as `device` |
| S3 | `curl -L -o tvsaver.apk https://github.com/tshi-dev/TV-ScreenSaver/releases/download/apk-latest/tvsaver.apk` | ~2–5 MB file |
| S4 | `adb uninstall com.abdullah.tvsaver` (ignore "not installed") | Old app removed — required, the signing key changed |
| S5 | `adb install tvsaver.apk` | `Success` |
| S6 | `adb shell dumpsys package com.abdullah.tvsaver \| grep versionName` | `versionName=2.<number>` |

## 1. Settings screen

Open: `adb shell am start -n com.abdullah.tvsaver/.SettingsActivity`
Navigate with the remote, or `adb shell input keyevent DPAD_DOWN|DPAD_UP|DPAD_CENTER|BACK`.

| ID | Action | Expected |
|---|---|---|
| A1 | Open the app from the TV launcher | Banner «شاشة تلفزيونك»; settings list opens, right-to-left, first row focused |
| A2 | Move through every row with D-pad | Every row focusable and highlighted; nothing unreachable |
| A3 | المدينة → open | First item «بحث عن مدينة أو قرية…», then 13 regions with counts |
| A4 | Region «منطقة الرياض» → pick «الخرج» | Dialog closes, row shows «المدينة: الخرج» |
| A5 | المدينة → search → type `ابها` or `Abha` | Results list from the internet; pick one → row updates |
| A6 | المدينة → search → type `zzzzqq` | Toast «لا توجد نتائج» |
| A7 | الفريق الأول → «تصفح الدوريات…» → each league one by one | Each opens a list of clubs. **Record any league that shows «لا توجد نتائج»** |
| A8 | الفريق الأول → «تصفح الدوريات…» → دوري روشن → pick Al-Nassr | Toast «جارٍ جلب الاسم بالعربية…», row shows «النصر» (Arabic) |
| A9 | الفريق الثاني → «بحث عن أي فريق أو منتخب…» → `Real Madrid` | Results; pick → row shows an Arabic name (e.g. «ريال مدريد») |
| A10 | الفريق الثاني → «بدون» | Row shows «بدون» |
| A11 | التصنيفات → tick دراما + كوميديا → حفظ | Row lists both |
| A12 | اللغات → tick الإنجليزية → حفظ | Row shows it |
| A13 | مسلسلات مختارة → «إضافة مسلسل» → `The Last of Us` → pick | Toast «تمت إضافة …», row lists the show (English title) |
| A14 | مسلسلات مختارة → untick it → حفظ | Removed |
| A15 | أقل تقييم → 8 | Row shows 8 |
| A16 | التحديث التلقائي → press | Toggles يعمل/متوقف; set back to يعمل |
| A17 | تحقق من التحديث الآن | Toast «تم التحديث» or «الصفحة محدثة» (not «لا يوجد اتصال») |
| A18 | إعدادات شاشة التوقف في التلفاز | TV screensaver settings open |
| A19 | Force-close and reopen: `adb shell am force-stop com.abdullah.tvsaver` then A1 | All choices from A4–A15 kept |

## 2. Preview / screen content

Open: «معاينة الشاشة» row, or `adb shell am start -n com.abdullah.tvsaver/.MainActivity`. Wait 60 s for data.

| ID | Check | Expected |
|---|---|---|
| B1 | Overall | Full screen, photo background, no white flash, no scrollbars, no cursor, all text Arabic except show titles and «S&P 500» |
| B2 | Clock | 12-hour Arabic digits, gold colon, small gold ص/م at the **upper left** of the time; matches the TV's real Riyadh time |
| B3 | Under clock | «بتوقيت <chosen city>» |
| B4 | Top right | Hijri date (with هـ) over Gregorian date (Gregorian month name, e.g. أكتوبر) |
| B5 | Top left chips | تاسي / S&P 500 / بيتكوين each with ▲ green or ▼ red (or no arrow — never a dash). Weather chip: city, temperature °, condition word (or «غبار»), high/low |
| B6 | Markets accuracy | Compare arrows with today's TASI, S&P 500 and BTC 24h direction on any finance site |
| B7 | هذا الأسبوع | Up to 5 shows matching A11–A15 filters, with season/episode, rating, weekday. Changes page every 25 s |
| B8 | الصلاة القادمة | Next prayer name + time + «بعد …». Compare with https://www.ummulqura.org.sa or the Aladhan site for the chosen city: within 1–2 min |
| B9 | رمضان panel | «رمضان ١٤٤٨», day count, start date. (In Ramadan: الإفطار/الإمساك instead) |
| B10 | المباريات | Team 1 on the right, team 2 on the left, side by side, divider between. Slot hidden if no match within 7 days. Both hidden → «لا شيء هذا الأسبوع» |
| B11 | Team names | Arabic for all clubs. A non-preset club may show a rough spelling for a few seconds, then the official Arabic name |
| B12 | Background credit | Tiny «الصورة: …» bottom-left corner |
| B13 | Any remote key | Preview closes |
| B14 | Change city to جدة (A4/A5), reopen preview | Prayer times, weather and «بتوقيت جدة» change |

## 3. Time-based behaviour

Use the TV's clock or wait for the real moment; take a screenshot at each.

| ID | When | Expected |
|---|---|---|
| C1 | Within 25 min after any adhan (10 min after Maghrib) | Prayer panel glows gold: «حان الآن», prayer name, «الإقامة بعد … دقيقة» |
| C2 | Friday before Dhuhr | Prayer name «الجمعة»; no iqama countdown after it |
| C3 | Between 21:00 and 07:00 | Screen gradually dimmer; darkest 23:00–05:00 |
| C4 | During a live match of a chosen team | Score + «مباشر · الدقيقة …», updates within ~2 min of real goals |
| C5 | Within 24 h after that match | «النتيجة النهائية · <day>» with the final score |
| C6 | After midnight | New background photo; dates, prayers, shows refreshed |
| C7 | Leave it running 2+ hours | Text shifts a few pixels every 4 min (burn-in protection); no freeze; clock still correct |

## 4. Screensaver (dream)

| ID | Action | Expected |
|---|---|---|
| D1 | TV Settings → screensaver → choose «شاشة تلفزيونك», or `adb shell settings put secure screensaver_components com.abdullah.tvsaver/.ScreenDream` | Selected |
| D2 | Start now: `adb shell am start -n "com.android.systemui/.Somnambulator"` (or wait for the idle timer) | Dashboard appears full screen |
| D3 | Press any remote key | Screensaver exits |
| D4 | Leave the TV idle for the timer set in TV settings | Starts by itself |

## 5. Offline

| ID | Action | Expected |
|---|---|---|
| E1 | Disconnect the TV from Wi-Fi/Ethernet, open preview | Clock, both dates, prayer countdown (computed on device), Ramadan panel all shown. Markets arrows hidden, no dash; weather chip shows only the city; no error text |
| E2 | Reconnect, wait 2 min, reopen | Live data returns |

## 6. Auto-update

| ID | Action | Expected |
|---|---|---|
| F1 | Press A17 twice in a row | First «تم التحديث», second «الصفحة محدثة» (the page is cached and unchanged) |
| F2 | Ask the developer to push a visible change (or note the latest commit), then A17 | Toast «تم التحديث»; preview shows the change |
| F3 | `adb shell dumpsys jobscheduler \| grep -A3 tvsaver` | A periodic, persisted job listed |

## 7. Power cycle (TCL)

| ID | Action | Expected |
|---|---|---|
| G1 | Unplug the TV for 30 s, power on, **do not open the app**, wait for the idle timer | Screensaver starts. If not: note it, open the app once, retest D4 |
| G2 | `adb logcat -d \| grep -iE "dream\|tvsaver" > G1.log` after G1 | Attach the log |

## 8. Browser (no app)

| ID | Action | Expected |
|---|---|---|
| H1 | On a computer open `https://raw.githack.com/tshi-dev/TV-ScreenSaver/master/dist/ksa-dashboard.html` or download `dist/ksa-dashboard.html` and double-click | Same screen in the browser; `F` toggles full screen |
| H2 | Add `#city=جدة&lat=21.5433&lon=39.1728&team1=136013&team2=` to the URL | Jeddah times; only one match slot |
| H3 | Resize the window to 1280×720 | Layout holds, nothing overlaps |

---

## Report format

```
ID | PASS/FAIL | note | screenshot file
A7 | FAIL | "الدوري الهولندي" shows لا توجد نتائج | A7.png
```

Send back the table plus every FAIL screenshot/log.
