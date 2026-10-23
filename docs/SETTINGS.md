# What تلفزيونك already does: look here before you build anything

For an agent working on a TV that has تلفزيونك, during the setup or any time after. When the person asks for
something about the screensaver, the home screen or the TV, find it in the tables below and run its command.

## Rules

- **Use the setting.** Everything below is already in the apps; one command changes it, the screen redraws, and
  it stays through every update.
- **Never build or patch the apps for a request.** No editing `android/`, `src/` or `dist/`, no building an APK,
  no installing your own build, no turning the automatic update off. The next update would undo it, a build of
  your own can't update itself afterwards, and the TV is left on a version nobody else has.
- **Not in the tables?** Tell the person, in Arabic, that it isn't in تلفزيونك yet, and that their words can go
  to the developer as a suggestion: add them to the share message at the end (`optimize/share.sh --preview
  --owner "<their words>" …`, see `docs/SETUP-PROMPT.md` step 8). Don't make it yourself.
- **Close to one?** Offer the nearest setting (a trip date: the countdown; a darker card: `cardstyle dark1`).
- **After a change:** read it back (`optimize/saver.sh show`, `optimize/dock.sh show`) and look at a screenshot
  (`optimize/shot.sh screensaver` or `optimize/shot.sh home`, the `-small.png`) before you say it's done.
- `optimize/saver.sh`, `optimize/dock.sh` and `optimize/music.sh` with no arguments list every option.
  Names and texts go in single quotes; no apostrophes inside them.

## The screensaver «شاشة تلفزيونك»

| They ask for | The setting | Command |
|---|---|---|
| their city, prayer times for it | المدينة | `optimize/saver.sh cities`, then `optimize/saver.sh city <name>` (a short form is fine if only one city matches); not listed: `optimize/saver.sh city '<name>' <lat> <lon>`, outside Saudi Arabia add its time zone: `… <lat> <lon> Asia/Kuwait` (without it, the TV's own zone) |
| their clubs, the matches | الفرق المتابعة (up to 20) | `optimize/saver.sh find-team <club>` (Arabic or English), then `optimize/saver.sh teams <id:Name> …` in their order |
| a whole league, every match of its clubs | الدوريات كاملة (up to 5) | `optimize/saver.sh leagues 'Saudi-Arabian Pro League'` (the Arabic name, «دوري روشن السعودي», works too; `""` = none) |
| Formula 1, UFC, boxing | رياضات أخرى | `optimize/saver.sh events f1,ufc,boxing` (`""` = none) |
| what shows beside the clock | المحتوى | `optimize/saver.sh card <verse, wisdom, adhkar, stocks, tasks, year, shows, prayers, forecast, matches, none>` |
| verse / hadith of the day | آية اليوم وحديث اليوم | `optimize/saver.sh card verse` (a verse one day, a hadith the next) |
| the year, a dot for every day | السنة | `optimize/saver.sh card year` (365 dots, 366 in a leap year; days gone light up toward gold, today glows; «اليوم ٢٩٦ من ٣٦٥ · ٨١٪» under it; also `home-card year`) |
| a proverb or saying | حكمة اليوم | `optimize/saver.sh card wisdom` |
| morning and evening adhkar | أذكار الصباح والمساء | `optimize/saver.sh card adhkar` (morning Fajr–Dhuhr, evening Asr–Maghrib, end of al-Baqara at night; else the verse) |
| today's prayer times as a list | مواقيت الصلاة اليوم | `optimize/saver.sh card prayers` (the next prayer is always at the bottom right) |
| the weather for the coming days | طقس الأيام القادمة | `optimize/saver.sh card forecast`, or the bottom-left `optimize/saver.sh slot weather` |
| new episodes of series | جديد المسلسلات | `optimize/saver.sh card shows`; filters `genres`, `langs`, `minrating` (`optimize/saver.sh` lists them); «مسلسلات مختارة» is in the app's settings |
| their stocks | الأسهم | `optimize/saver.sh stocks 2222 1120 AAPL` (up to 8: 4 digits = Tadawul, letters = US) and `optimize/saver.sh card stocks` |
| a to-do list | المهام | `optimize/saver.sh tasks add '<text>'` (also `list`, `done N`, `del N`, `clear`) and `optimize/saver.sh card tasks`; on the home screen the «المهام» pill, with voice |
| a different look for that card | شكل البطاقة | `optimize/saver.sh cardstyle <current, dark1, glass1, dark3, glass3>` |
| numbers as 123, not ١٢٣ | الأرقام | `optimize/saver.sh digits latin` (`hindi` = ١٢٣, the default) |
| no green on National / Founding Day | المناسبات الوطنية | `optimize/saver.sh national off` (`auto` is the default) |
| what the bottom-left shows | الخانة اليسرى | `optimize/saver.sh slot <matches, weather, fasting, countdown, markets, none>` |
| the next voluntary fast | الصيام | `optimize/saver.sh slot fasting` |
| days left to a date (a trip, a wedding) | العدّ التنازلي | `optimize/saver.sh countdown <YYYY-MM-DD> '<name>'` and `optimize/saver.sh slot countdown` (`countdown clear` removes it) |
| markets at the top left | الأسواق | `optimize/saver.sh markets <up to 4 of tasi, aramco, spx, btc, gold, silver, xrp>` |
| prices, not just arrows | عرض الأسواق | `optimize/saver.sh mkstyle prices` (`arrows` is the default) |
| the next occasion, Ramadan, Eid | المناسبة القادمة | always shown in the middle at the bottom; nothing to set |
| the photo to change more or less often | تبديل الصورة كل | `optimize/saver.sh photos <5, 10, 15, 30, 60>` (minutes) |
| the screensaver to start sooner or later | بدء شاشة التوقف بعد | `optimize/saver.sh idle <1, 2, 5, 10, 15, 30>` (minutes; the TV's own timer) |
| the newest screen now | تحديث الشاشة الآن | `optimize/saver.sh update` (it also updates by itself; keep «التحديث التلقائي للصفحة» on) |
| which version they have, how to update | the last lines of the settings | `optimize/saver.sh show` (first line: `version: …`, and the newest one if known); to update the apps, `docs/SETUP-PROMPT.md` (the settings stay) |
| to see the screensaver now | معاينة الشاشة | `optimize/start-saver.sh`, or `optimize/shot.sh screensaver` |
| everything as it is now | | `optimize/saver.sh show` |

## The home screen «تلفزيونك»

| They ask for | The setting | Command |
|---|---|---|
| their favourite apps in the row, in order | ترتيب التطبيقات المفضلة | `optimize/dock.sh apps`, then `optimize/dock.sh set <pkg> …` (5–10, in their order); `optimize/dock.sh show`, `optimize/dock.sh reset` |
| an app hidden, or a missing one shown | | `optimize/dock.sh hidden` (what is left out and why), `optimize/dock.sh hide <pkg> …`, `optimize/dock.sh show <pkg> …` |
| app names in Arabic | أسماء التطبيقات | `optimize/dock.sh names`, then `optimize/dock.sh name <pkg> '<الاسم>' …` for each still in English (`''` = its usual name; `names-clear` = all back) |
| a card on the home screen | بطاقة على الشاشة الرئيسية | `optimize/saver.sh home-card <same choices as card, or none>` |
| the Quran, Quran radio | تلاوة | the «تلاوة» pill; from the computer `optimize/music.sh status`, `reciters`, `stations`, `surah <reciter> <1-114>`, `radio <n>`, `pause`, `resume`, `toggle`, `next`, `prev`, `seek <seconds>`, `stop`, `sleep <minutes>` |
| the adhan at prayer times | الأذان | `optimize/music.sh adhan` (status), `adhan on` / `off`, `adhan voice <n>`, `adhan now` |
| HDMI inputs, Wi-Fi, the TV's settings | | the «المصادر», «واي فاي» and «الإعدادات» pills on the home screen |

## The TV itself

| They ask for / it happened | Command |
|---|---|
| something protected went off (AirPlay, casting, voice, updates) | `optimize/keep.sh` |
| a TV system update brought the old home back, or apps back on | `optimize/run.sh again` (settings stay) |
| undo everything, back as it came | `optimize/reset.sh` |
| restart the TV | `optimize/venv/bin/python -I optimize/tv.py --reboot` (never a plain `reboot`) |
| how much memory is free | `optimize/measure.sh after --now` |
| a screenshot | `optimize/shot.sh home`, `screensaver`, `settings`, `favourites`, `now <name>` |
| send the developer how it went | `optimize/share.sh --preview …`, then `--send` (`docs/SETUP-PROMPT.md` step 8) |

## Not in تلفزيونك yet (say so, and pass it on with `--owner`)

- Being built, not on TVs yet: their own background photos;
  turning our screensaver off when it is heavy for the TV.
- Asked for, not planned yet: other countries' photos and prayer methods, moving cards around (layout), a news
  ticker, a flight countdown with the flight number (the countdown above can count to the trip's date).
- Not possible: Samsung (Tizen) and LG (webOS) TVs can't run these apps.
