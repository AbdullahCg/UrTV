# Saudi TV Screensaver

شاشة توقف عربية لتلفاز 16:9: الساعة، التاريخ الهجري والميلادي، الصلاة القادمة، العد التنازلي لرمضان، مباريات الهلال والمنتخب، الطقس، اتجاه الأسواق، وجديد المسلسلات هذا الأسبوع — فوق صورة من معالم المملكة تتغير يومياً.

An always-on, Arabic-only, right-to-left screensaver for a 1920×1080 TV. One self-contained HTML file with fonts and photos inlined, so it runs offline and from `file://`.

## Layout

```
src/template.html          the page itself (HTML/CSS/JS) — edit this
assets/fonts/              Thmanyah woff2 weights (Light, Regular, Medium, Display Bold)
assets/backgrounds/        7 licensed Saudi landscapes + backgrounds.json (credit, brightness)
build.py                   inlines fonts and photos -> dist/ksa-dashboard.html
dist/ksa-dashboard.html    the built file to copy to the TV / APK assets
docs/RECREATE-PROMPT.md    the full design + behaviour spec
```

## Build

```sh
python3 build.py
```

No dependencies. Open `dist/ksa-dashboard.html` in any browser; press `F` for fullscreen.

## City

The page reads its config from the URL fragment (works on `file://` and in an Android WebView):

```
ksa-dashboard.html#city=جدة&lat=21.5433&lon=39.1728&tz=Asia/Riyadh
```

Defaults to Riyadh. Team ids, prayer method and keys are in the `CONFIG` object at the top of the script.

## Data sources (free, no keys)

Aladhan (prayer, Umm al-Qura), Open-Meteo (weather), Yahoo chart API via allorigins (TASI, S&P 500), CoinGecko (Bitcoin), TVMaze (premieres), TheSportsDB (fixtures). Every fetch fails soft: without network the clock, dates, Ramadan countdown, prayer countdown and known fixture still render.

## Android

The shipped app is a `DreamService` APK that loads `dist/ksa-dashboard.html` from its assets — see the last section of `docs/RECREATE-PROMPT.md`.
