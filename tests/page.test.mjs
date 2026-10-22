// Screen tests in a real browser, offline: both pages, every card, card-only mode, old settings links.
//
//   npm install playwright@1.56.1 && npx playwright install chromium     (once)
//   node tests/page.test.mjs
//
// Network is cut; the photos and fonts the app serves from the device are served from the repo instead,
// the way PhotoCache.java answers them on the TV.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = name => 'file://' + path.join(ROOT, 'dist', name);
const INDEX = readFileSync(path.join(ROOT, 'photos/index.json'), 'utf8');
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  -> ' + detail));
  if (!ok) failed++;
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function open(file, hash, { width = 1920, height = 1080, seed = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route(/^https?:/, r => {
    const u = r.request().url(), i = u.indexOf('/master/'), rel = i > 0 ? u.slice(i + 8) : '';
    if (/^(assets\/(backgrounds|fonts)|photos)\//.test(rel))
      return r.fulfill({ path: path.join(ROOT, rel), headers: { 'Access-Control-Allow-Origin': '*' } });
    return r.abort();
  });
  if (seed) await ctx.addInitScript(i => { try { localStorage.setItem('photoIndex', i); } catch (e) {} }, INDEX);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(page(file) + '#' + hash);
  await p.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 4000 })
    .catch(() => errors.push('never revealed'));
  await p.waitForTimeout(300);
  return { p, ctx, errors };
}

// ---- both pages, three screen sizes: no errors, shown, clock right, nothing off screen, Arabic digits
for (const file of ['urtv.html', 'tv.html']) {
  for (const [w, h] of [[1920, 1080], [1280, 720], [960, 540]]) {
    const { p, ctx, errors } = await open(file, 'city=جدة&lat=21.5433&lon=39.1728', { width: w, height: h });
    const tag = `${file} ${w}x${h}`;
    check(`${tag}: no script errors, page shown`, !errors.length, errors.join('; '));
    const r = await p.evaluate(() => {
      const hh = document.getElementById('ck-h').textContent, mm = document.getElementById('ck-m').textContent;
      const toN = s => +s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      const off = [...document.querySelectorAll('.stage *')].filter(e => {
        const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return cs.display !== 'none' && b.width && (b.left < -2 || b.right > innerWidth + 2 || b.bottom > innerHeight + 2);
      }).map(e => e.className || e.id || e.tagName).slice(0, 5);
      const latin = (document.querySelector('.stage').innerText.match(/[0-9]+/g) || []).filter(x => x !== '500');
      return { hh, mm, h: toN(hh), m: toN(mm), ap: document.getElementById('ck-ap').textContent,
               sub: document.getElementById('clock-sub').textContent, off, latin,
               photo: !!document.querySelector('.photo').style.backgroundImage };
    });
    check(`${tag}: 12-hour clock in Arabic digits`, /^[٠-٩]{1,2}$/.test(r.hh) && r.h >= 1 && r.h <= 12
      && /^[٠-٩]{2}$/.test(r.mm) && r.m < 60 && ['ص', 'م'].includes(r.ap), JSON.stringify(r));
    check(`${tag}: city from the settings`, r.sub === 'بتوقيت جدة', r.sub);
    check(`${tag}: nothing off screen`, !r.off.length, r.off.join(', '));
    check(`${tag}: no Latin digits (except S&P 500)`, !r.latin.length, r.latin.join(' '));
    check(`${tag}: a background photo`, r.photo);
    await ctx.close();
  }
}

// ---- every card beside the clock, with sample data where the card needs the network
const SAMPLE = {
  forecast: () => { FORECAST = [0, 1, 2, 3, 4].map(i => ({ date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), code: 2, hi: 37 - i, lo: 24 - i })); },
  matches: () => {
    const ev = (id, h, a, hrs) => ({ idEvent: id, strHomeTeam: h, strAwayTeam: a, strTimestamp: new Date(Date.now() + hrs * 36e5).toISOString() });
    NEXT_LIST = { '136013': [ev('a', 'Al-Hilal', 'Al-Nassr', 3), ev('b', 'Al-Ahli', 'Al-Hilal', 80)] };
  },
};
const EXPECT = { prayers: [6, 'مواقيت اليوم'], forecast: [5, 'الأيام القادمة'], matches: [2, 'مباريات فرقك'],
                 verse: [2, null], shows: [1, 'هذا الأسبوع'] };
for (const [panel, [rows, title]] of Object.entries(EXPECT)) {
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=' + panel);
  if (SAMPLE[panel]) await p.evaluate(`(${SAMPLE[panel]})(); renderPanel(false);`);
  const r = await p.evaluate(() => ({ n: document.querySelectorAll('#week-list li').length,
    hd: document.getElementById('week-hd').textContent, shown: getComputedStyle(document.querySelector('.week')).display !== 'none' }));
  check(`card ${panel}: no errors`, !errors.length, errors.join('; '));
  check(`card ${panel}: ${rows} rows, title right`, r.shown && r.n === rows && (!title || r.hd === title)
    && (title || ['آية اليوم', 'حديث اليوم'].includes(r.hd)), JSON.stringify(r));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'panel=verse');
  const both = await p.evaluate(() => {
    const day = riyadhDayNumber, out = [];
    for (const k of [0, 1]) { window.riyadhDayNumber = () => day() + k; out.push(quoteOfDay().title); }
    return out.sort().join(',');
  });
  check('card verse: a verse one day, a hadith the next', both === 'آية اليوم,حديث اليوم', both);
  await ctx.close();
}

// ---- every verse and hadith fits the card: each day's text drawn, clear of the clock and the bottom bar
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=verse', { width, height });
  const r = await p.evaluate(() => {
    const day = riyadhDayNumber(), card = document.querySelector('.week'), bad = [];
    const days = 2 * Math.max(VERSES.length, HADITH.length);   // a verse on even days, a hadith on odd: all of both
    let tallest = 0;
    for (let k = 0; k < days; k++) {
      window.riyadhDayNumber = () => day + k;
      renderPanel(false);
      const c = card.getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect();
      const bar = document.querySelector('.bottom').getBoundingClientRect();
      tallest = Math.max(tallest, c.height);
      const top = document.querySelector('.top').getBoundingClientRect();
      // a card beside the clock, not a page: clear of the top line, the clock and the bottom bar, at most 42% high
      if (c.top < top.bottom || c.bottom > bar.top - 4 || c.right > clock.left - 4 || c.height > 0.42 * innerHeight)
        bad.push(`${Math.round(c.top)}-${Math.round(c.bottom)}/${Math.round(bar.top)} ` + card.querySelector('.quote').textContent.slice(0, 40));
    }
    return { days, bad, tallest: Math.round(tallest) };
  });
  check(`every verse and hadith fits the card at ${width}x${height} (${r.days} days, tallest ${r.tallest}px)`,
    !errors.length && !r.bad.length, `${r.bad.length} spill: ` + r.bad.slice(0, 3).join(' | ') + errors.join('; '));
  await ctx.close();
}

// ---- photo interval: #photos=N (5 10 15 30 60), anything else 30; the photo changes on that slot
for (const [hash, want] of [['', 30], ['photos=5', 5], ['photos=60', 60], ['photos=7', 30], ['photos=abc', 30], ['photos=0', 30]]) {
  const { p, ctx, errors } = await open('tv.html', hash);
  const r = await p.evaluate(() => {
    const real = riyadhParts;
    const at = (h, mi) => { window.riyadhParts = () => ({ ...real(), h, mi }); BG_SLOT = -1; applyBackground(true); return BG_SLOT; };
    return [CONFIG.photoMinutes, at(10, 4), at(10, 5), at(10, 29), at(10, 30), at(10, 59), at(11, 0)];
  });
  const per = want, changes = [[4, 5], [29, 30], [59, 60]].map(([a, b]) => Math.floor(a / per) !== Math.floor(b / per));
  const got = [r[1] !== r[2], r[3] !== r[4], r[5] !== r[6]];
  check(`link #${hash || '(empty)'} → CONFIG.photoMinutes ${want}, photo changes on that slot`,
    !errors.length && r[0] === want && JSON.stringify(got) === JSON.stringify(changes), JSON.stringify([r, changes]) + errors.join('; '));
  await ctx.close();
}

// ---- digits: #digits=latin shows 0-9 everywhere, anything else the Eastern ٠-٩ as before
for (const [hash, latin] of [['', false], ['digits=hindi', false], ['digits=latin', true], ['digits=bogus', false]]) {
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=prayers&' + hash);
  const r = await p.evaluate(() => {
    MATCHES['136013'] = {idEvent:'x1', strHomeTeam:'Al-Hilal', strAwayTeam:'Al-Nassr', strTimestamp:new Date(Date.now() + 3 * 86400000 + 36e5).toISOString(), strStatus:'NS'};
    renderMatches(); tickDates(); tickOccasion();
    const text = document.querySelector('.stage').innerText.replace('500', '');   // S&P 500 is a name
    return { lat: (text.match(/[0-9]/g) || []).length, east: (text.match(/[٠-٩]/g) || []).length,
             clock: document.getElementById('ck-h').textContent + ':' + document.getElementById('ck-m').textContent,
             hijri: document.getElementById('hijri').textContent, greg: document.getElementById('greg').textContent,
             days: document.getElementById('occ-days').textContent };
  });
  const ok = latin ? r.lat > 10 && r.east === 0 && /^\d+:\d+$/.test(r.clock) && /\d/.test(r.hijri) && /\d/.test(r.greg)
                   : r.east > 10 && r.lat === 0;
  check(`link #${hash || '(empty)'} → ${latin ? '0-9' : '٠-٩'} in clock, dates, countdown and matches`, !errors.length && ok, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- «المناسبة القادمة»: each occasion counts down, then shows its own day (dates as Umm al-Qura gives them)
{
  const { p, ctx, errors } = await open('tv.html', 'panel=verse');
  const at = iso => p.evaluate(iso => {
    const T = Date.parse(iso), R = Date;
    window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
    OCC_CACHE = { day: '', val: null }; tickOccasion();
    const t = id => document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
    return [t('occ-label'), t('occ-days'), t('occ-sub')];
  }, iso + 'T12:00:00Z');
  const cases = [
    ['2026-10-22', 'رمضان ١٤٤٨', '١٠٩ يوم', '٨ فبراير'],
    ['2027-03-09', 'عيد الفطر', 'عيد مبارك', ''],
    ['2027-03-11', 'عيد الفطر', 'عيد مبارك', ''],
    ['2027-03-12', 'عشر ذي الحجة', '٥٦ يوم', '٧ مايو'],
    ['2027-05-07', 'عشر ذي الحجة', 'اليوم أول أيام العشر', ''],
    ['2027-05-08', 'يوم عرفة', '٧ يوم', '١٥ مايو'],
    ['2027-05-15', 'يوم عرفة', 'اليوم يوم عرفة', ''],
    ['2027-05-16', 'عيد الأضحى', 'عيد مبارك', ''],
    ['2027-05-19', 'عيد الأضحى', 'عيد مبارك', ''],
    ['2027-05-20', 'رأس السنة الهجرية', '١٧ يوم', '٦ يونيو'],
    ['2027-06-06', 'رأس السنة الهجرية', 'اليوم رأس السنة الهجرية', ''],
    ['2027-06-07', 'عاشوراء', '٨ يوم', '١٥ يونيو'],
    ['2027-06-15', 'عاشوراء', 'اليوم عاشوراء', ''],
    ['2027-06-16', 'رمضان ١٤٤٩', '٢٢٦ يوم', '٢٨ يناير'],
  ];
  for (const [day, label, big, date] of cases) {
    const r = await at(day);
    const ok = r[0] === label && r[1] === big && (date ? r[2].includes(date) && r[2].includes('متوقّع') : r[2] === '');
    check(`occasion on ${day}: ${label} · ${big}`, !errors.length && ok, JSON.stringify(r) + errors.join('; '));
  }
  const r = await at('2027-06-07');
  check('عاشوراء counts down with «ويُستحب صيام التاسع»', r[2].includes('ويُستحب صيام التاسع'), r[2]);
  await p.evaluate(() => buildPrayers({ Fajr: '04:30', Dhuhr: '11:50', Asr: '15:10', Maghrib: '17:45', Isha: '19:15' }));
  const ram = await at('2027-02-20');
  check('during Ramadan the card still shows iftar / suhoor', ram[0] === 'الإفطار' || ram[0] === 'الإمساك', JSON.stringify(ram));
  await ctx.close();
}

// ---- card style: #cardstyle=current|dark1|glass1|dark3|glass3, anything else = current; the launcher's card keeps its look
for (const [hash, want] of [['', 'current'], ['cardstyle=current', 'current'], ['cardstyle=dark1', 'dark1'], ['cardstyle=glass1', 'glass1'],
                             ['cardstyle=dark3', 'dark3'], ['cardstyle=glass3', 'glass3'], ['cardstyle=bogus', 'current'], ['cardstyle=DARK1', 'current']]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=verse&' + hash);
  const r = await p.evaluate(() => ({ s: CONFIG.cardStyle, cls: document.documentElement.className.match(/cs-\S+/)?.[0] || '',
    bg: getComputedStyle(document.querySelector('.week')).backgroundColor, radius: getComputedStyle(document.querySelector('.week')).borderTopLeftRadius }));
  const ok = r.s === want && r.cls === (want === 'current' ? '' : 'cs-' + want)
    && (want !== 'current' || (r.bg === 'rgba(4, 14, 9, 0.6)' && r.radius === '12px'));   // the default card is untouched
  check(`link #${hash || '(empty)'} → card style ${want}`, !errors.length && ok, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}
{
  const { p, ctx, errors } = await open('tv.html', 'panel=verse&cardstyle=glass3&widget=1');
  check('card-only mode ignores the card style', !errors.length && await p.evaluate(() => !/cs-/.test(document.documentElement.className)));
  await ctx.close();
}
for (const style of ['dark1', 'glass1', 'dark3', 'glass3', 'current']) {
  const { p, ctx, errors } = await open('tv.html', `panel=verse&cardstyle=${style}`);
  const has = () => p.evaluate(() => !!document.querySelector('.week canvas.bl'));
  const settling = !(await has());   // the photo is still drifting: the plain tint only
  await p.evaluate(() => cardBlurNow());   // what the timer does 61 s after the photo
  await p.waitForTimeout(500);
  const made = await has();
  const geo = await p.evaluate(() => { const c = document.querySelector('.week canvas.bl'), w = document.querySelector('.week').getBoundingClientRect();
    return c ? { w: c.width, h: c.height, fits: Math.abs(c.getBoundingClientRect().width - w.width) < 4 } : null; });
  await p.evaluate(() => showBackground('about:blank#other', {}));   // the photo changes
  const gone = !(await has());
  const want = style !== 'current';
  check(`card style ${style}: plain while settling, blurred copy ${want ? 'made once, sized to the card, released on a new photo' : 'never made'}`,
    !errors.length && settling && made === want && gone && (!want || (geo && geo.w > 50 && geo.h > 20 && geo.fits)), JSON.stringify({ settling, made, gone, geo }) + errors.join('; '));
  await ctx.close();
}

// ---- old settings links and «لا شيء»
for (const [hash, panel, shown] of [['', 'verse', true], ['week=0', 'none', false], ['week=1', 'verse', true],
                                     ['panel=none', 'none', false], ['panel=bogus', 'verse', true]]) {
  const { p, ctx, errors } = await open('tv.html', hash);
  const r = await p.evaluate(() => [CONFIG.panel, getComputedStyle(document.querySelector('.week')).display !== 'none']);
  check(`link #${hash || '(empty)'} → ${panel}, card ${shown ? 'shown' : 'hidden'}`,
    !errors.length && r[0] === panel && r[1] === shown, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- card-only mode for the launcher: transparent, only the card, no photo
for (const panel of ['prayers', 'verse', 'shows']) {
  const { p, ctx, errors } = await open('tv.html', `widget=1&panel=${panel}`, { width: 461, height: 250 });
  const r = await p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    visible: [...document.querySelectorAll('.top,.clockwrap,.bottom,.photo')].filter(e => getComputedStyle(e).display !== 'none').length,
    card: document.querySelector('.week').getBoundingClientRect().width }));
  check(`launcher card ${panel}: transparent, only the card`, !errors.length && r.bg === 'rgba(0, 0, 0, 0)'
    && r.visible === 0 && r.card > 400, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- last panels come back at once on the next start
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#panel=shows');
  await p.waitForTimeout(800);
  await p.evaluate(() => { document.getElementById('week-list').innerHTML = '<li>SAVED</li>'; saveSnap(); });
  await p.reload();
  const t = await p.evaluate(() => document.getElementById('week-list').textContent);
  check('saved panels restored on the next start', t === 'SAVED', t);
  await ctx.close();
}

// ---- offline start: weather, market arrows and the match row stay as they were last time
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#teams=136013');
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.getElementById('wx-temp').textContent = '٣٨°';
    document.getElementById('wx-desc').textContent = 'غبار';
    document.getElementById('wx-desc').classList.add('dust');
    paintDir(TICKERS[0], true);
    document.getElementById('match-row').innerHTML = '<div class="saved-match">SAVED</div>';
    saveSnap();
  });
  await p.reload();
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({
    temp: document.getElementById('wx-temp').textContent,
    dust: document.getElementById('wx-desc').classList.contains('dust'),
    arrow: document.getElementById('tasi-chg').textContent,
    row: document.getElementById('match-row').textContent.trim() }));
  check('offline start: weather, arrow and match row kept', r.temp === '٣٨°' && r.dust && r.arrow === '▲' && r.row === 'SAVED', JSON.stringify(r));
  await ctx.close();
}

// ---- a finished game's score stays up for a day, even when the API has already moved on
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#teams=136013&panel=matches');
  await p.waitForTimeout(800);
  const slot = () => p.evaluate(() => document.getElementById('match-row').innerText.replace(/\s+/g, ' ').trim());
  const game = (id, hoursAgo, score, status) => `({idEvent:'${id}', strHomeTeam:'Al-Hilal', strAwayTeam:'Al-Nassr',
    strTimestamp:new Date(Date.now() - ${hoursAgo} * 36e5).toISOString(), intHomeScore:${score ? score[0] : null},
    intAwayScore:${score ? score[1] : null}, strStatus:'${status}'})`;

  await p.evaluate(`MATCHES['136013'] = ${game('g1', 1.8, [2, 1], 'FT')}; renderMatches();`);
  let t = await slot();
  check('whistle blown: final score at once, not «مباشر»', t.includes('النتيجة النهائية') && t.includes('٢ - ١') && !t.includes('مباشر'), t);

  await p.evaluate(`keepResult('136013', MATCHES['136013']); MATCHES['136013'] = ${game('g2', -72, null, 'NS')};
                    RESULTS = {}; renderMatches();`);
  t = await slot();
  check('API moved to the next fixture: score still shown', t.includes('النتيجة النهائية') && t.includes('٢ - ١'), t);

  await p.reload();
  await p.waitForTimeout(800);
  await p.evaluate(`MATCHES['136013'] = ${game('g2', -72, null, 'NS')}; renderMatches();`);
  t = await slot();
  check('after a restart the same day: score still shown', t.includes('٢ - ١'), t);

  await p.evaluate(`KEPT['136013'] = [${game('g1', 27, [2, 1], 'FT')}]; renderMatches();`);
  t = await slot();
  check('a day later: score gone, next fixture shown', !t.includes('٢ - ١') && t.includes('×'), t);
  await ctx.close();
}

// ---- an upcoming match shows «بعد …» and under it its date and time (Riyadh), small
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#teams=136013&panel=matches');
  await p.waitForTimeout(800);
  // 2026-10-24 18:16 UTC = Saturday 9:16 pm in Riyadh
  const r = await p.evaluate(() => {
    MATCHES['136013'] = {idEvent:'d1', strHomeTeam:'Al-Hilal', strAwayTeam:'Al-Nassr', strTimestamp:'2026-10-24T18:16:00Z', strStatus:'NS'};
    const real = Date.now; Date.now = () => Date.parse('2026-10-21T18:16:00Z');
    renderMatches(); Date.now = real;
    const sub = [...document.querySelectorAll('#match-row .sub')];
    const when = document.querySelector('#match-row .sub.when');
    return { subs: sub.map(x => x.textContent.trim()), small: when && parseFloat(getComputedStyle(when).fontSize) < parseFloat(getComputedStyle(sub[0]).fontSize) };
  });
  check('upcoming match: «بعد ٣ أيام» then «السبت ٢٤ أكتوبر · ٩:١٦ م» in smaller text',
    r.subs.length === 2 && r.subs[0] === 'بعد ٣ أيام' && r.subs[1] === 'السبت ٢٤ أكتوبر · ٩:١٦ م' && r.small, JSON.stringify(r));
  await ctx.close();
}


// two games side by side on a small screen: long club names shrink, then take their short form, never «…»
for (const [width, height] of [[1920, 1080], [960, 540], [720, 405]]) {
  const { p, ctx } = await open('urtv.html', 'panel=verse', { width, height });
  const r = await p.evaluate(() => {
    const row = document.getElementById('match-row');
    const blk = (a, b) => `<div class="mblock"><div class="big"><span>${a} × ${b}</span></div><div class="sub">بعد ٣ أيام</div></div>`;
    row.innerHTML = blk('أستون فيلا', 'مانشستر سيتي') + blk('برشلونة', 'ريال مدريد');
    fitMatches(row);
    const sp = [...row.querySelectorAll('.big > span')];
    return { names: sp.map(s => s.textContent), fit: sp.every(s => s.scrollWidth <= s.clientWidth + 1),
             same: new Set(sp.map(s => getComputedStyle(s).fontSize)).size === 1 };
  });
  check(`two matches at ${width}px: names fit, one size, no «…»`, r.fit && r.same, JSON.stringify(r));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall page tests passed');
process.exit(failed ? 1 : 0);
