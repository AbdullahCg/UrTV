// Screen tests in a real browser, offline: both pages, every card, card-only mode, old settings links.
//
//   npm install playwright@1.56.1 && npx playwright install chromium     (once)
//   node tests/page.test.mjs
//
// Network is cut; the photos and fonts the app serves from the device are served from the repo instead,
// the way PhotoCache.java answers them on the TV.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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

async function open(file, hash, { width = 1920, height = 1080, seed = true, net = null, now = null, tzId = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(tzId ? { timezoneId: tzId } : {}) });
  await ctx.route(/^https?:/, r => {
    if (net && net(r)) return;
    const u = r.request().url(), i = u.indexOf('/master/'), rel = i > 0 ? u.slice(i + 8) : '';
    if (/^(assets\/(backgrounds|fonts)|photos)\//.test(rel))
      return r.fulfill({ path: path.join(ROOT, rel), headers: { 'Access-Control-Allow-Origin': '*' } });
    return r.abort();
  });
  if (seed) await ctx.addInitScript(i => { try { localStorage.setItem('photoIndex', i); } catch (e) {} }, INDEX);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  if (now) await p.clock.setFixedTime(now);   // the page's Date is this moment; timers run as usual
  await p.goto(page(file) + '#' + hash);
  await p.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 4000 })
    .catch(() => errors.push('never revealed'));
  await p.waitForTimeout(300);
  return { p, ctx, errors };
}

// A restart of the page, for the tests of what the page keeps in localStorage. Chromium writes a page's storage out a moment after
// the write and, now and then (about one run in ten, on the branch before these tests were added too), starts the reloaded page
// before that: it finds nothing. What the browser keeps is not what is tested, so the keys are carried over by hand, as the TV's
// WebView keeps them: put back at the start of the next load, where the page has none.
const restart = async p => {
  const kept = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  await p.context().addInitScript(kv => {
    try { const o = JSON.parse(kv); for (const k in o) if (localStorage.getItem(k) === null) localStorage.setItem(k, o[k]); } catch (e) {}
  }, kept);
  await p.reload();
};

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
                 verse: [2, null], wisdom: [2, 'حكمة اليوم'], shows: [1, 'هذا الأسبوع'] };
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

// ---- «حكمة اليوم»: one saying a day by the Riyadh day number, every one fits the card, the source is shown
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=wisdom', { width, height });
  const r = await p.evaluate(() => {
    const day = riyadhDayNumber(), card = document.querySelector('.week'), bad = [], seen = new Set();
    for (let k = 0; k < WISDOM.length + 2; k++) {
      window.riyadhDayNumber = () => day + k;
      renderPanel(false);
      const li = card.querySelectorAll('#week-list li'), c = card.getBoundingClientRect();
      const clock = document.querySelector('.clockwrap').getBoundingClientRect(), bar = document.querySelector('.bottom').getBoundingClientRect();
      const top = document.querySelector('.top').getBoundingClientRect();
      if (k < WISDOM.length) seen.add(li[0].textContent);
      if (li[0].textContent !== WISDOM[(day + k) % WISDOM.length].text || li[1].textContent !== WISDOM[(day + k) % WISDOM.length].source
          || document.getElementById('week-hd').textContent !== 'حكمة اليوم' || c.top < top.bottom || c.bottom > bar.top - 4
          || c.right > clock.left - 4 || c.height > 0.42 * innerHeight) bad.push(li[0].textContent.slice(0, 30));
    }
    return { n: WISDOM.length, days: seen.size, bad };
  });
  check(`card wisdom at ${width}x${height}: ${r.n} sayings, one each day, all fit`,
    !errors.length && r.n >= 50 && r.days === r.n && !r.bad.length, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- «أذكار الصباح والمساء»: morning from Fajr to Dhuhr, evening from Asr to Maghrib, the night one (end of al-Baqara) from Isha
// to Fajr, else the verse card; one timer, only inside
const ADHKAR_SAMPLE = [
  { when: 'morning', text: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', count: 1, source: 'صحيح مسلم · 2723' },
  { when: 'both', text: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ', count: 3, source: 'سنن أبي داود · 5088' },
  { when: 'evening', text: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ', count: 7, source: 'صحيح مسلم · 2723' },
  { when: 'both', text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', count: 100, source: 'صحيح مسلم · 2692' },
  { when: 'both', text: 'قُلْ هُوَ اللَّهُ أَحَدٌ', count: 3, source: 'سورة الإخلاص · 1–4', quran: true },
  { when: 'night', text: 'آمَنَ الرَّسُولُ بِمَا أُنزِلَ إِلَيْهِ مِن رَّبِّهِ', count: 1, source: 'سورة البقرة · 285–286', quran: true,
    virtue: { text: 'مَنْ قَرَأَ بِهِمَا فِي لَيْلَةٍ كَفَتَاهُ', source: 'صحيح البخاري · 5009' } },
];
const LONG_DHIKR = { when: 'both', text: Array(68).fill('سُبْحَانَ اللَّهِ وَبِحَمْدِهِ').join(' ').split(' ').slice(0, 68).join(' '), count: 1, source: 'سنن أبي داود · 5074' };
const atRiyadh = (p, hhmm) => p.evaluate(([hhmm, sample]) => {
  const T = Date.parse('2026-10-22T' + hhmm + ':00+03:00'), R = Date;
  window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
  ADHKAR.length = 0; ADHKAR.push(...sample);
  buildPrayers({ Fajr: '04:40', Sunrise: '06:00', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:30', Isha: '19:00' });
  clearTimeout(CARDS[0].ad.t); CARDS[0].ad.t = 0; CARDS[0].ad.i = 0; CARDS[0].ad.mode = '';
  renderPanel(false);
  const hd = document.getElementById('week-hd');
  return { hd: hd.textContent.replace(/\s+/g, ' ').trim(), icon: !!hd.querySelector('svg'), timer: CARDS[0].ad.t !== 0,
    text: document.querySelector('#week-list .quote')?.textContent, foot: document.querySelector('#week-list .adf')?.textContent || '',
    dots: [...document.querySelectorAll('#week-list .adf .d i')].map(i => i.classList.contains('on') ? 1 : 0).join('') };
}, [hhmm, ADHKAR_SAMPLE]);
{
  const { p, ctx, errors } = await open('tv.html', 'panel=adhkar');
  const m = await atRiyadh(p, '06:00'), e = await atRiyadh(p, '16:00'), noon = await atRiyadh(p, '13:00'), dusk = await atRiyadh(p, '18:30');
  const edge = [await atRiyadh(p, '04:39'), await atRiyadh(p, '04:40'), await atRiyadh(p, '11:39'), await atRiyadh(p, '11:40'),
                await atRiyadh(p, '14:59'), await atRiyadh(p, '15:00'), await atRiyadh(p, '17:29'), await atRiyadh(p, '17:30')].map(r => /^(أذكار|الآيتان)/.test(r.hd));
  const n = await atRiyadh(p, '22:00'), after = await atRiyadh(p, '03:00');
  const nightEdge = [await atRiyadh(p, '18:59'), await atRiyadh(p, '19:00'), await atRiyadh(p, '23:59'), await atRiyadh(p, '00:00'), await atRiyadh(p, '04:39')].map(r => r.hd);
  check('adhkar morning (6:00): title, sun icon, «حتى الظهر», first dhikr, one timer',
    m.hd === 'أذكار الصباححتى الظهر' && m.icon && m.timer && m.text.replace(/[\u064B-\u065F]/g, '').startsWith('أصبحنا') && m.dots === '1000', JSON.stringify(m));
  check('adhkar evening (16:00): title, icon, «حتى المغرب», the evening ones only',
    e.hd === 'أذكار المساءحتى المغرب' && e.icon && e.timer && e.text.replace(/[\u064B-\u065F]/g, '').startsWith('بسم') && e.dots === '1000', JSON.stringify(e));
  check('adhkar outside the windows (13:00, 18:30): the verse or hadith of the day, no footer, no timer',
    [noon, dusk].every(r => /^(آية|حديث) اليوم$/.test(r.hd) && !r.icon && !r.timer && !r.foot && r.text), JSON.stringify([noon, dusk]));
  check('adhkar windows: from Fajr up to Dhuhr, from Asr up to Maghrib (and the night before Fajr)', edge.join() === 'true,true,true,false,false,true,true,false', edge.join());
  check('adhkar night (22:00, and 03:00 after midnight): «الآيتان من آخر سورة البقرة» (the hadith\'s words, no invented name), moon icon, «حتى الفجر», only that verse (not the «both» ones), the hadith\'s own words as its source line',
    [n, after].every(r => r.hd === 'الآيتان من آخر سورة البقرةحتى الفجر' && r.icon && r.timer && r.text.replace(/[\u064B-\u065F]/g, '').replace(/﴿/g, '').startsWith('آمن') && r.dots === '1' &&
      r.foot.replace(/[\u064B-\u065F]/g, '').startsWith('من قرأ بهما في ليلة كفتاه · صحيح البخاري ٥٠٠٩')),
    JSON.stringify([n, after]));
  check('adhkar night: from Isha (19:00) until Fajr (04:40), the card in between is the verse card',
    /^(آية|حديث) اليوم$/.test(nightEdge[0]) && nightEdge.slice(1).every(h => h === 'الآيتان من آخر سورة البقرةحتى الفجر'), nightEdge.join('|'));
  const r = await p.evaluate(() => {
    const out = [], st = window.setTimeout, ms = [];
    window.setTimeout = (f, t) => { ms.push(t); return st(f, t); };
    const Dt = window.Date, T = Date.parse('2026-10-22T06:00:00+03:00');
    window.Date = class extends Dt { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
    clearTimeout(CARDS[0].ad.t); CARDS[0].ad.t = 0; CARDS[0].ad.i = 0; CARDS[0].ad.mode = ''; renderPanel(false);
    for (let k = 0; k < 5; k++) {
      const li = document.querySelectorAll('#week-list li'), ft = li[1].textContent.replace(/\s+/g, ' ');
      out.push([li[0].textContent.replace(/[\u064B-\u065F﴿]/g, '').split(' ')[0], ft, [...li[1].querySelectorAll('.d i')].map(i => +i.classList.contains('on')).join(''),
                document.querySelector('#week-list').classList.contains('flip')]);
      adhkarNext(CARDS[0]);
    }
    window.setTimeout = st;
    return { out, ms: ms.filter(t => t >= 20000) };
  });
  const feet = r.out.map(x => x[1]);
  check('adhkar rotation: each dhikr in turn, count in words, dots follow, wraps to the first',
    r.out.map(x => x[0]).join('|') === 'أصبحنا|بسم|سبحان|قل|أصبحنا'
    && /مرة واحدة/.test(feet[0]) && /ثلاث مرات/.test(feet[1]) && /مئة مرة/.test(feet[2]) && /ثلاث مرات/.test(feet[3])
    && r.out.map(x => x[2]).join() === '1000,0100,0010,0001,1000' && feet[0].includes('صحيح مسلم · ٢٧٢٣'), JSON.stringify(r.out));
  check('adhkar timer: 20 s + 0.1 s per character, at most 60 s', r.ms.length === 6 &&
    r.ms.every((t, i) => t === Math.min(60, 20 + .1 * [0, 1, 3, 4, 0, 1].map(k => ADHKAR_SAMPLE[k].text.length)[i]) * 1000), JSON.stringify(r.ms));
  const w = await p.evaluate(() => {   // the window closes while a dhikr is on screen: the next turn shows the verse card and stops the timer
    const T = Date.parse('2026-10-22T11:41:00+03:00'), Dt = window.Date;
    window.Date = class extends Dt { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
    adhkarNext(CARDS[0]);
    return [document.getElementById('week-hd').textContent, CARDS[0].ad.t];
  });
  check('adhkar: when the window closes the card turns to the verse card and the timer stops', /^(آية|حديث) اليوم$/.test(w[0]) && w[1] === 0, JSON.stringify(w));
  check('adhkar: no script errors', !errors.length, errors.join('; '));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'panel=adhkar&digits=latin');
  const m = await atRiyadh(p, '06:00');
  check('adhkar with digits=latin: the source in 0-9', m.foot.includes('2723') && !/[٠-٩]/.test(m.foot), m.foot);
  await ctx.close();
}
// nothing overflows: the longest dhikr the build lets in, every screen size and every card style
for (const [width, height, style] of [[1920, 1080, ''], [1280, 720, ''], [960, 540, ''], [1920, 1080, 'dark1'], [1920, 1080, 'glass1'],
                                      [1920, 1080, 'dark3'], [1920, 1080, 'glass3'], [1280, 720, 'dark3'], [960, 540, 'glass3']]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=adhkar' + (style ? '&cardstyle=' + style : ''), { width, height });
  const r = await p.evaluate(([sample, long]) => {
    const R = Date;
    ADHKAR.length = 0; ADHKAR.push(...sample, long);
    buildPrayers({ Fajr: '04:40', Sunrise: '06:00', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:30', Isha: '19:00' });
    const card = document.querySelector('.week'), bad = [];
    const top = document.querySelector('.top').getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect();
    const bar = document.querySelector('.bottom').getBoundingClientRect();
    for (const [hhmm, i] of ADHKAR.map((d, i) => ['06:00', i]).concat([['22:00', 0]])) {   // each morning dhikr, then the night one
      const T = Date.parse('2026-10-22T' + hhmm + ':00+03:00');
      window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
      CARDS[0].ad.mode = ''; CARDS[0].ad.i = i; clearTimeout(CARDS[0].ad.t); CARDS[0].ad.t = 0; renderPanel(false);
      const c = card.getBoundingClientRect(), ft = card.querySelector('.adf'), f = ft.getBoundingClientRect();
      const wide = [...card.querySelectorAll('.hd *, .adf *')].some(e => e.getBoundingClientRect().right > c.right + 1 || e.getBoundingClientRect().left < c.left - 1);
      if (c.top < top.bottom || c.bottom > bar.top - 4 || c.right > clock.left - 4 || c.height > 0.42 * innerHeight || f.bottom > c.bottom + 1
          || ft.scrollWidth > ft.clientWidth + 1 || wide) bad.push(i + ':' + Math.round(c.height) + '/' + Math.round(0.42 * innerHeight));
    }
    CARDS[0].ad.t && clearTimeout(CARDS[0].ad.t);
    return { n: ADHKAR.length, bad };
  }, [ADHKAR_SAMPLE, LONG_DHIKR]);
  check(`adhkar card fits at ${width}x${height}${style ? ' ' + style : ''} (${r.n} dhikr, longest included)`, !errors.length && !r.bad.length, JSON.stringify(r.bad) + errors.join('; '));
  await ctx.close();
}

// ---- every verse and hadith fits the card: each day's text drawn, clear of the clock and the bottom bar,
// in every card style, and with the tafsir on (a long one is put under each verse, three lines at most)
const LONG_TAFSIR = 'هذا شرح ميسر للآية الكريمة يبين معناها بعبارة سهلة قريبة من الفهم ويذكر ما فيها من الهداية والعبرة والأحكام ' +
  'ويطيل الكلام حتى يزيد عن ثلاثة أسطر في البطاقة مهما اتسعت ليتأكد الاختبار أن النص يقطع عند كلمة كاملة وتتبعه علامة الحذف في آخره';
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const hash of ['panel=verse', 'panel=verse&cardstyle=dark1', 'panel=verse&cardstyle=glass1', 'panel=verse&cardstyle=dark3',
                      'panel=verse&cardstyle=glass3', 'panel=verse&tafsir=1&cardstyle=glass3', 'panel=verse&tafsir=1']) {
    const { p, ctx, errors } = await open('tv.html', hash, { width, height });
    const r = await p.evaluate(tafsir => {
      if (CONFIG.tafsir) VERSES.forEach(v => { v.tafsir = tafsir; });
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
    }, LONG_TAFSIR);
    check(`every verse and hadith fits the card at ${width}x${height} #${hash} (${r.days} days, tallest ${r.tallest}px)`,
      !errors.length && !r.bad.length, `${r.bad.length} spill: ` + r.bad.slice(0, 3).join(' | ') + errors.join('; '));
    await ctx.close();
  }
}

// ---- the Quran text is set in the Uthmanic Hafs font (verse of the day, Quranic adhkar), hadith and the rest are not
{
  const { p, ctx, errors } = await open('tv.html', 'panel=verse');
  const r = await p.evaluate(async () => {
    const day = riyadhDayNumber(), fam = () => getComputedStyle(document.querySelector('#week-list .qt, #week-list li.quote')).fontFamily;
    window.riyadhDayNumber = () => day - (day % 2);   // a verse day
    renderPanel(false);
    const verse = { fam: getComputedStyle(document.querySelector('#week-list .qt')).fontFamily, orn: getComputedStyle(document.querySelector('#week-list .orn')).fontFamily };
    await document.fonts.load('20px UthmanicHafs', VERSES[0].text);
    window.riyadhDayNumber = () => day - (day % 2) + 1;   // a hadith day
    renderPanel(false);
    return { verse, hadithQt: !!document.querySelector('#week-list .qt'), loaded: document.fonts.check('20px UthmanicHafs', VERSES[0].text),
             status: [...document.fonts].filter(f => f.family.includes('UthmanicHafs')).map(f => f.status) };
  });
  check('the verse text is in UthmanicHafs, the brackets stay NotoMarks, the font loads, a hadith has none of it',
    !errors.length && /^"?UthmanicHafs/.test(r.verse.fam) && /NotoMarks/.test(r.verse.orn) && r.loaded && r.status.includes('loaded') && !r.hadithQt,
    JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

const TAFSIR_3X = [LONG_TAFSIR, LONG_TAFSIR, LONG_TAFSIR].join(' ');   // well over three lines at any size
// ---- «التفسير الميسر» under the verse of the day: #tafsir=1 only, small, three lines at most cut at a word with «…»;
// never on a hadith day, never in the adhkar card, nothing when a verse has none
for (const [hash, on] of [['panel=verse', false], ['panel=verse&tafsir=1', true], ['panel=verse&tafsir=0', false], ['panel=verse&tafsir=yes', false]]) {
  for (const [width, height] of [[1920, 1080], [960, 540]]) {
    const { p, ctx, errors } = await open('tv.html', hash, { width, height });
    const r = await p.evaluate(long => {
      const per = 2 * VERSES.length, day = per * Math.ceil(riyadhDayNumber() / per), at = k => { window.riyadhDayNumber = () => day + k; renderPanel(false); };
      const tafsir = () => document.querySelector('#week-list li.tafsir');
      VERSES[0].tafsir = long; VERSES[1].tafsir = 'تفسير قصير.'; delete VERSES[2].tafsir;
      at(0);
      const t = tafsir(), long1 = t && t.textContent;
      const lines = t ? Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) : 0;
      const after = t && t.previousElementSibling.className;
      at(2); const short = tafsir() && tafsir().textContent;
      at(4); const none = !!tafsir();
      at(1); const hadith = !!tafsir();
      ADHKAR.length = 0; ADHKAR.push({ when: 'both', text: 'قُلْ هُوَ اللَّهُ أَحَدٌ', count: 3, source: 'سورة الإخلاص · 1–4', quran: true });
      buildPrayers({ Fajr: '00:00', Sunrise: '00:01', Dhuhr: '23:58', Asr: '00:00', Maghrib: '23:59', Isha: '23:59' });
      CARDS[0].kind = 'adhkar'; renderPanel(false);
      return { long1, lines, after, short, none, hadith, adhkar: !!tafsir(), words: long.split(' ').length };
    }, TAFSIR_3X);
    const ok = on
      ? r.long1 && r.lines <= 3 && r.long1.endsWith('…') && !/[\s،,:؛.]…$/.test(r.long1) && TAFSIR_3X.startsWith(r.long1.slice(0, -1))
        && TAFSIR_3X[r.long1.length - 1] === ' ' && r.short === 'تفسير قصير.' && !r.none && !r.hadith && !r.adhkar && r.after === 'src'
      : r.long1 === null && r.short === null && !r.none && !r.hadith && !r.adhkar;
    check(`link #${hash} at ${width}x${height} → tafsir ${on ? 'under the verse, 3 lines at most, cut at a word with «…»' : 'off'}; never on hadith or adhkar cards`,
      !errors.length && !!ok, JSON.stringify(r) + errors.join('; '));
    await ctx.close();
  }
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

// ---- card style: #cardstyle=current|dark1|glass1|dark3|glass3, anything else = current; the launcher's cards follow it too
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
  check('card-only mode follows the card style', !errors.length && await p.evaluate(() => /cs-glass3/.test(document.documentElement.className)
    && getComputedStyle(document.querySelector('.week')).borderTopLeftRadius === '30px'));
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
// ---- «المهام»: the open tasks as the app sends them (one per line, URL-encoded), escaped, fitting, paged
const TASKS = ['اشتري خبز وحليب من البقالة', '<b onclick=alert(1)>x</b> & "قهوة" \'سكر\'',
  'اتصل بالمهندس عبدالرحمن بخصوص موعد تركيب المكيّف الجديد في غرفة الضيوف قبل الجمعة',
  'موعد المستشفى الساعة 5:30', 'تجديد الاشتراك', 'ادفع فاتورة الكهرباء', 'اشتري هدية', 'أرسل التقرير'];
const tasksHash = list => 'panel=tasks&tasks=' + encodeURIComponent(list.join('\n'));
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', tasksHash(TASKS), { width, height });
  const r = await p.evaluate(() => {
    const ul = document.getElementById('week-list'), card = document.querySelector('.week');
    const bar = document.querySelector('.bottom').getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect();
    const top = document.querySelector('.top').getBoundingClientRect();
    const dot = (cs => ({ backgroundColor: cs.backgroundColor, borderRadius: cs.borderRadius }))(getComputedStyle(ul.querySelector('li'), '::before'));
    const rows = () => [...ul.querySelectorAll('li')].map(li => li.textContent);
    const page1 = rows();
    CARDS[0].page++; renderPanel(false);
    const c = card.getBoundingClientRect();
    return { hd: document.getElementById('week-hd').textContent, page1, page2: rows(), html: ul.innerHTML,
             injected: !!ul.querySelector('b, [onclick]'), dotBg: dot.backgroundColor, dotRadius: dot.borderRadius,
             tooWide: [...ul.querySelectorAll('li')].filter(li => li.scrollWidth > li.clientWidth + 1).length,
             fits: c.top >= top.bottom && c.bottom <= bar.top - 4 && c.right <= clock.left - 4 && c.height <= 0.42 * innerHeight };
  });
  const tag = `${width}x${height}`;
  check(`card tasks ${tag}: title, five rows a page, text kept`, !errors.length && r.hd === 'المهام' && r.page1.length === 5
    && r.page1[0] === TASKS[0] && r.page1[1] === TASKS[1] && r.page1[2] === TASKS[2].slice(0, 60), JSON.stringify(r.page1) + errors.join('; '));
  check(`card tasks ${tag}: special characters escaped, none run as HTML`, !r.injected && r.html.includes('&lt;b onclick'), r.html.slice(0, 200));
  check(`card tasks ${tag}: gold dot on every row`, r.dotBg === 'rgb(220, 184, 111)' && r.dotRadius !== '0px', r.dotBg + ' ' + r.dotRadius);
  check(`card tasks ${tag}: next page shows the rest`, r.page2.length === 5 && r.page2[2] === TASKS[7] && r.page2[3] === TASKS[0], JSON.stringify(r.page2));
  check(`card tasks ${tag}: clear of the clock and the bottom bar`, r.fits);
  await ctx.close();
}
for (const [hash, rows, text] of [['panel=tasks', 1, 'لا مهام اليوم'], ['panel=tasks&tasks=', 1, 'لا مهام اليوم'],
                                  [tasksHash(['واحد', '', '  اثنان  ']), 2, 'واحد']]) {
  const { p, ctx, errors } = await open('tv.html', hash);
  const r = await p.evaluate(() => [document.querySelectorAll('#week-list li').length, document.querySelector('#week-list li').textContent]);
  check(`card tasks, ${hash.length > 20 ? 'blank lines dropped' : 'nothing to do'}: ${rows} row`, !errors.length && r[0] === rows && r[1] === text, JSON.stringify(r));
  await ctx.close();
}
{
  const long = Array.from({ length: 30 }, (_, i) => 'مهمة رقم ' + i + ' ' + 'ن'.repeat(80));
  const { p, ctx, errors } = await open('tv.html', tasksHash(long));
  const r = await p.evaluate(() => [CONFIG.tasks.length, Math.max(...CONFIG.tasks.map(t => t.length))]);
  check('card tasks: at most 12 of 60 characters', !errors.length && r[0] === 12 && r[1] <= 60, JSON.stringify(r));
  await ctx.close();
}
{
  const { p, ctx, errors } = await open('tv.html', tasksHash(TASKS) + '&widget=1', { width: 461, height: 250 });
  const n = await p.evaluate(() => document.querySelectorAll('#week-list li').length);
  check('launcher card tasks: the rows are there', !errors.length && n === 5, n + errors.join('; '));
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
  await restart(p);
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
  await restart(p);
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

  await restart(p);
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


// two games side by side on a small screen: each game stays on one line and fits, never «…»
for (const [width, height] of [[1920, 1080], [960, 540], [720, 405]]) {
  const { p, ctx } = await open('urtv.html', 'panel=verse', { width, height });
  const r = await p.evaluate(() => {
    const row = document.getElementById('match-row');
    const blk = (a, b) => `<div class="mblock"><div class="big"><span><span class="tm">${a}</span> × <span class="tm">${b}</span></span></div><div class="sub">بعد ٣ أيام</div></div>`;
    const out = [];
    for (const [a, b, c, d] of [['أستون فيلا', 'مانشستر سيتي', 'برشلونة', 'ريال مدريد'], ['باريس سان جيرمان', 'بايرن ميونخ', 'الهلال', 'النصر']]) {
      row.innerHTML = blk(a, b) + blk(c, d);
      fitMatches(row);
      const sp = [...row.querySelectorAll('.big > span')];
      const rg = document.createRange();
      out.push({ fit: sp.every(s => { rg.selectNodeContents(s); const cs = getComputedStyle(s); return rg.getBoundingClientRect().width <= s.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + .05; }),
                 same: new Set(sp.map(s => getComputedStyle(s).fontSize)).size === 1 });
    }
    const sp = [...row.querySelectorAll('.big > span')];
    return { out, whole: !row.textContent.includes('…') && row.querySelectorAll('.big > span').length === 2 && [...row.querySelectorAll('.big > span')].every(s => s.getBoundingClientRect().height < parseFloat(getComputedStyle(s).fontSize) * 2),
             fit: out.every(o => o.fit),
             same: out.every(o => o.same) };
  });
  check(`two matches at ${width}px: one line each, fits, one size`, r.fit && r.same && r.whole, JSON.stringify(r));
  await ctx.close();
}

// ---- «الأسواق»: which markets and the prices, with the network mocked (Yahoo chart and CoinGecko answers)
const chart = (price, closes, prevClose) => JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prevClose },
  indicators: { quote: [{ close: closes }] } }] } });
const MOCK = { '^TASI.SR': chart(11500.4, [11400, 11450, 11500.4]), '2222.SR': chart(26.3, [26, 26.2, 26.3]), '^GSPC': chart(6800.2, [6850, 6900, 6800.2]),
               'GC=F': chart(4000, [3950, 3980, 4000]), 'SI=F': chart(50, [49, 50, 50]) };
const marketNet = state => r => {
  const u = r.request().url();
  if (state.off) { r.abort(); return true; }
  let m = u.match(/chart\/([^?]+)\?/);
  if (m) { const sym = decodeURIComponent(m[1]); if (state.fail && state.fail.includes(sym)) { r.fulfill({ status: 404, body: '{}' }); return true; }
           r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK[sym] }); return true; }
  m = u.match(/coingecko.*ids=(\w+)/);
  if (m) { r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ [m[1]]: m[1] === 'bitcoin' ? { usd: 67000.4, usd_24h_change: -1.234 } : { usd: 2.3456, usd_24h_change: 3.1 } }) }); return true; }
  return false;
};
const mk = p => p.evaluate(() => [...document.querySelectorAll('.mk .m')].map(m => ({ n: m.children[0].textContent,
  px: (m.querySelector('.px') || {}).hidden === false ? m.querySelector('.px').textContent + '|' + (m.querySelector('.px').dataset.u || '') : null,
  ch: m.querySelector('.delta').hidden ? null : m.querySelector('.delta').textContent, up: m.querySelector('.delta').classList.contains('up') })));
{
  const state = {};
  const { p, ctx, errors } = await open('tv.html', 'markets=tasi,aramco,gold,btc&mkstyle=prices', { net: marketNet(state) });
  await p.waitForTimeout(800);
  let r = await mk(p), up = await p.evaluate(() => document.getElementById('mk-up').textContent);
  check('markets prices: no errors', !errors.length, errors.join('; '));
  check('markets prices: names in the order chosen', r.map(x => x.n).join() === 'تاسي,أرامكو,الذهب,بيتكوين', JSON.stringify(r));
  check('markets prices: index 0 decimals, stock 2, gram of gold 2 in ريال, bitcoin in dollars',
    r[0].px === '١١٬٥٠٠|' && r[1].px === '٢٦٫٣٠|ر.س' && r[2].px === '٤٨٢٫٢٦|ر.س' && r[3].px === '٦٧٬٠٠٠|$', JSON.stringify(r));
  check('markets prices: the day\'s change with the arrow, coloured', r[0].ch === '▲ ٠٫٤٤٪' && r[0].up && r[2].ch === '▲ ٠٫٥٠٪' && r[3].ch === '▼ ١٫٢٣٪' && !r[3].up, JSON.stringify(r));
  check('markets prices: «آخر تحديث» with the time', /^آخر تحديث [٠-٩]{1,2}:[٠-٩]{2} [صم]$/.test(up), up);
  state.off = true;                       // offline: what is shown stays
  await p.evaluate(() => TICKERS.forEach(loadTicker));
  await p.waitForTimeout(500);
  check('markets prices: offline keeps the last values', JSON.stringify(await mk(p)) === JSON.stringify(r));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'markets=aramco,silver,xrp&mkstyle=prices', { net: marketNet({ fail: ['2222.SR'] }) });
  await p.waitForTimeout(800);
  const r = await mk(p);
  check('markets prices: an unknown price and change stay hidden, nothing invented', r[0].px === null && r[0].ch === null, JSON.stringify(r[0]));
  check('markets prices: silver per gram, ripple in dollars', r[1].px === '٦٫٠٣|ر.س' && r[2].px === '٢٫٣٥|$' && r[2].ch === '▲ ٣٫١٠٪', JSON.stringify(r));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'markets=spx,gold&digits=latin&mkstyle=prices', { net: marketNet({}) });
  await p.waitForTimeout(800);
  const r = await mk(p);
  check('markets prices: Latin digits when asked', r[0].px === '6,800|' && r[0].ch === '▼ 1.45%' && r[1].px === '482.26|ر.س', JSON.stringify(r));
  await ctx.close();
}
for (const [hash, want, price] of [['', 'تاسي,S&P 500,بيتكوين', false], ['markets=foo', 'تاسي,S&P 500,بيتكوين', false],
    ['markets=foo,gold,gold,silver,aramco,xrp,btc', 'الذهب,الفضة,أرامكو,ريبل', false], ['mkstyle=bogus', 'تاسي,S&P 500,بيتكوين', false]]) {
  const { p, ctx, errors } = await open('tv.html', hash, { net: marketNet({}) });
  await p.waitForTimeout(500);
  const r = await mk(p), px = await p.evaluate(() => !!document.getElementById('mk-up') || !!document.querySelector('.mk .px'));
  check(`markets «${hash}»: ${want}, arrows only`, !errors.length && r.map(x => x.n).join() === want && !px && r.every(x => x.ch === null || /^[▲▼]$/.test(x.ch)), JSON.stringify(r) + errors);
  await ctx.close();
}
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const hash of ['markets=tasi,aramco,gold,silver&mkstyle=prices', 'markets=btc,xrp&mkstyle=prices']) {
    const { p, ctx } = await open('tv.html', hash, { width, height, net: marketNet({}) });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const m = document.querySelector('.markets').getBoundingClientRect(), d = document.querySelector('.dates').getBoundingClientRect(),
            clock = document.querySelector('.clockwrap').getBoundingClientRect();
      const off = [...document.querySelectorAll('.markets *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > innerWidth + 1); }).map(e => e.className || e.id || e.textContent);
      return { off, overDates: m.right > d.left - 4, overClock: m.bottom > clock.top - 2, up: document.getElementById('mk-up').getBoundingClientRect().bottom };
    });
    check(`markets prices at ${width}x${height} (${hash.slice(8, 30)}): fits, clear of the date and the clock`, !r.off.length && !r.overDates && !r.overClock, JSON.stringify(r));
    await ctx.close();
  }
}

// ---- «الأسهم»: the watchlist card (mocked chart answers; markets open or closed by the Riyadh clock)
const stockChart = (price, prevClose, closes) => JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prevClose },
  indicators: { quote: [{ close: closes }] } }] } });
const day = (a, b, n = 20) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const STK = { '2222.SR': stockChart(26.3, 26.0, day(26, 26.3)), '1120.SR': stockChart(91.5, 92.0, day(92, 91.5)), 'AAPL': stockChart(250.25, 248, day(248, 250.25)),
              '9999.SR': stockChart(10, 10, day(10, 10)), 'NVDA': stockChart(180, 182, day(182, 180)), '1180.SR': stockChart(40, 39, day(39, 40)),
              '7010.SR': stockChart(41, 40, day(40, 41)), '2010.SR': stockChart(60, 61, day(61, 60)), 'MSFT': stockChart(420, 418, day(418, 420)) };
const stockNet = (state, seen = []) => r => {
  const m = r.request().url().match(/chart\/([^?]+)\?(.*)$/);
  if (!m) return false;
  const sym = decodeURIComponent(m[1]); seen.push(sym + '?' + m[2]);
  if (state.off || !STK[sym]) { r.abort(); return true; }
  r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: STK[sym] }); return true;
};
const at = iso => `{ const t = Date.parse('${iso}'); Date.now = () => t; }`;   // a fixed moment, set in the page
const stkRows = p => p.evaluate(() => ({ hd: document.getElementById('week-hd').textContent.trim(),
  rows: [...document.querySelectorAll('#week-list li.stk')].map(li => ({ nm: li.querySelector('.nm').firstChild.textContent, px: (li.querySelector('.px') || {}).textContent,
    chg: (li.querySelector('.chg') || {}).textContent, up: !!li.querySelector('.chg.up'), pts: li.querySelector('svg polyline') ? li.querySelector('svg polyline').getAttribute('points').split(' ').length : 0,
    closed: !!li.querySelector('.cl') })) }));
{
  const state = {}, seen = [];
  const { p, ctx, errors } = await open('tv.html', 'panel=stocks&stocks=2222,1120,AAPL,9999,nvda,2222', { net: stockNet(state, seen) });
  await p.evaluate(at('2026-10-22T08:00:00Z'));          // Thursday 11:00 in Riyadh: Tadawul open, the US not yet
  await p.waitForTimeout(800);
  await p.evaluate('renderPanel(false)');
  let r = await stkRows(p);
  check('stocks: no errors, header «الأسهم»', !errors.length && r.hd === 'الأسهم', r.hd + errors.join('; '));
  check('stocks: Arabic names for Saudi codes, the ticker for US ones, an unknown code as a number',
    r.rows.map(x => x.nm).join() === 'أرامكو,الراجحي,AAPL,٩٩٩٩,NVDA', JSON.stringify(r.rows));
  check('stocks: price, change with the arrow and its colour', r.rows[0].px === '٢٦٫٣٠' && r.rows[0].chg === '▲ ١٫١٥٪' && r.rows[0].up
    && r.rows[1].px === '٩١٫٥٠' && r.rows[1].chg === '▼ ٠٫٥٤٪' && !r.rows[1].up && r.rows[2].px === '٢٥٠٫٢٥', JSON.stringify(r.rows));
  check('stocks: a day line from the intraday closes', r.rows[0].pts === 20 && r.rows[1].pts === 20, JSON.stringify(r.rows.map(x => x.pts)));
  check('stocks: asked as 15-minute bars of one day; codes get .SR', seen.some(s => s === '2222.SR?interval=15m&range=1d') && seen.some(s => s.startsWith('AAPL?')) && !seen.some(s => s.startsWith('2222?')), seen.join(' '));
  check('stocks: market open for Tadawul, US row marked closed (the header says nothing)', r.hd === 'الأسهم' && r.rows[2].closed && !r.rows[0].closed, JSON.stringify(r.rows.map(x => x.closed)));
  await p.evaluate(at('2026-10-23T09:00:00Z'));          // Friday noon: both closed
  await p.evaluate('renderPanel(false)');
  r = await stkRows(p);
  check('stocks: «السوق مغلق» in the header when every market is closed, last close still shown', r.hd === 'الأسهم' + 'السوق مغلق' && r.rows[0].px === '٢٦٫٣٠' && !r.rows.some(x => x.closed), JSON.stringify(r));
  await p.evaluate(at('2026-10-20T15:00:00Z'));          // Tuesday 18:00: the US open, Tadawul closed
  await p.evaluate('renderPanel(false)');
  r = await stkRows(p);
  check('stocks: US open, Tadawul rows marked closed', r.hd === 'الأسهم' && r.rows[0].closed && !r.rows[2].closed, JSON.stringify(r));
  const before = await p.evaluate(() => document.getElementById('week-list').innerHTML);
  state.off = true;                                      // offline: the last values stay
  await p.evaluate('loadStocks()');
  await p.waitForTimeout(600);
  check('stocks: offline keeps the last values on screen', await p.evaluate(() => document.getElementById('week-list').innerHTML) === before);
  check('stocks: no Latin digits in the card', !/[0-9]/.test(await p.evaluate(() => document.getElementById('week-list').textContent)));
  await ctx.close();
}
for (const [market, mk] of [['open', 'panel=stocks&stocks=2222'], ['closed', 'panel=verse&stocks=2222']]) {
  const seen = [];
  const { ctx } = await open('tv.html', mk, { net: stockNet({}, seen) });
  await new Promise(r => setTimeout(r, 600));
  check(`stocks: the chart of the watchlist is fetched only while the card shows stocks (${mk.slice(0, 11)})`, seen.some(s => s.startsWith('2222.SR')) === (market === 'open'), seen.join(' '));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'panel=stocks&stocks=2222,2222,abc123,aapl,TOOLONGTICK,12345,1120,brk.b,7010,2010,1180,NVDA,MSFT,9999,2350', { net: stockNet({}) });
  const list = await p.evaluate(() => CONFIG.stocks.join());
  check('stocks: hash list — codes and tickers only, no duplicates, at most 8', list === '2222,AAPL,1120,BRK.B,7010,2010,1180,NVDA', list);
  await ctx.close();
}
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const style of ['', 'dark1', 'glass1', 'dark3', 'glass3']) {
    const { p, ctx, errors } = await open('tv.html', 'panel=stocks&stocks=2222,1120,1180,7010,2010,AAPL,NVDA,MSFT' + (style ? '&cardstyle=' + style : ''), { width, height, net: stockNet({}) });
    await p.evaluate(at('2026-10-22T08:00:00Z'));
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const card = document.querySelector('.week'), c = card.getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect(),
            bar = document.querySelector('.bottom').getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect();
      const rows = [...card.querySelectorAll('li.stk')], lc = card.getBoundingClientRect();
      const clipped = rows.filter(li => [...li.children].some(e => e.scrollWidth > e.clientWidth + 1 && e.classList.contains('nm'))
        || li.getBoundingClientRect().right > lc.right || li.getBoundingClientRect().left < lc.left).length;
      CARDS[0].page = 1; renderPanel(false);
      const page2 = [...card.querySelectorAll('li.stk .nm')].map(e => e.firstChild.textContent).join();
      return { n: rows.length, clipped, fit: c.top >= top.bottom && c.bottom <= bar.top - 4 && c.right <= clock.left - 4 && c.left >= 0 && c.height <= 0.5 * innerHeight, page2, h: c.height / innerHeight };
    });
    check(`stocks ${width}x${height} ${style || 'current'}: 5 rows a page, fits the card, no name cut, next page turns`,
      !errors.length && r.n === 5 && !r.clipped && r.fit && r.page2 === 'AAPL,NVDA,MSFT,أرامكو,الراجحي', JSON.stringify(r) + errors.join('; '));
    await ctx.close();
  }
}

// ---- the bottom-left slot: #slot= (matches weather fasting countdown none), wired like #digits=
const FAKE_NOW = iso => `(() => { const T = Date.parse('${iso}'), R = Date;
  window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } }; })()`;
const FORECAST_5 = `FORECAST = [0,1,2,3,4].map(i => ({date:'2026-10-2' + (2 + i), code:[0,2,3,95,1][i], hi:38 - i, lo:20}));`;
const slotText = p => p.evaluate(() => ({ label: document.getElementById('slot-label').textContent,
  row: document.getElementById('match-row').innerText.replace(/\s+/g, ' ').trim() }));
for (const [hash, want] of [['', 'matches'], ['slot=matches', 'matches'], ['slot=weather', 'weather'], ['slot=fasting', 'fasting'],
                            ['slot=countdown', 'countdown'], ['slot=none', 'none'], ['slot=bogus', 'matches'], ['slot=', 'matches']]) {
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&' + hash);
  const got = await p.evaluate(() => CONFIG.slot);
  check(`link #${hash || '(empty)'} → CONFIG.slot ${want}`, !errors.length && got === want, got + errors.join('; '));
  await ctx.close();
}
{   // matches stay the default; with no team followed the slot shows the weather
  let r = await open('tv.html', 'teams=136013');
  check('slot matches with a team: «المباريات»', (await slotText(r.p)).label === 'المباريات');
  await r.ctx.close();
  r = await open('tv.html', 'teams=');
  await r.p.evaluate(FORECAST_5 + FAKE_NOW('2026-10-22T09:00:00Z') + '; renderSlot();');
  const t = await slotText(r.p);
  check('no team followed: the slot shows the weather, not «لا شيء هذا الأسبوع»', t.label === 'الطقس' && !t.row.includes('لا شيء') && t.row.includes('٣٧°'), JSON.stringify(t));
  await r.ctx.close();
}
{   // weather: the next three days from the forecast the page has; a missing forecast keeps what was shown
  const { p, ctx, errors } = await open('tv.html', 'slot=weather');
  await p.evaluate(FORECAST_5 + FAKE_NOW('2026-10-22T09:00:00Z') + '; renderSlot();');
  const t = await slotText(p);
  check('weather slot: label and the next three days with their weather words',
    t.label === 'الطقس' && t.row === 'الجمعة ٣٧° غائم جزئياً السبت ٣٦° غائم الأحد ٣٥° عواصف رعدية', JSON.stringify(t));
  await p.evaluate(() => { FORECAST = []; renderSlot(); });
  check('weather slot: forecast missing, the last text stays', (await slotText(p)).row === t.row);
  const fit = await p.evaluate(() => { const r = document.getElementById('match-row').getBoundingClientRect(), c = document.querySelector('.p-match').getBoundingClientRect();
    return r.left >= c.left - 1 && r.right <= c.right + 1 && !document.getElementById('match-row').textContent.includes('…'); });
  check('weather slot fits its panel', fit && !errors.length, errors.join('; '));
  await ctx.close();
}
{   // fasting: a whole Hijri year of fake dates; never a forbidden day, always the earliest recommended one
  const { p, ctx, errors } = await open('tv.html', 'slot=fasting');
  const r = await p.evaluate(() => {
    const H = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
    const hij = d => H.formatToParts(d).reduce((a, x) => (a[x.type] = +x.value.replace(/[^0-9]/g, ''), a), {});
    const forbidden = h => (h.month === 10 && h.day === 1) || (h.month === 12 && h.day >= 10 && h.day <= 13);
    const rec = (h, wd) => !forbidden(h) && (h.month === 9 || (h.month === 12 && h.day === 9) || (h.month === 1 && (h.day === 9 || h.day === 10))
      || (h.day >= 13 && h.day <= 15) || wd === 1 || wd === 4 || (h.month === 10 && h.day >= 2));
    const bad = [], seen = new Set(), keys = new Set();
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const noon = Date.UTC(2026, 9, 22, 12) + i * 86400000, h0 = hij(new Date(noon));
      const f = fastingNext(new Date(noon - 3 * 3600000));   // noon in Riyadh
      n++;
      let want = 0;
      while (!rec(hij(new Date(noon + want * 86400000)), new Date(noon + want * 86400000).getUTCDay())) want++;
      const dh = hij(new Date(noon + f.days * 86400000));
      if (forbidden(dh)) bad.push('forbidden ' + i);
      if (f.days !== want) bad.push(`day ${i}: ${f.days} not ${want}`);
      if (forbidden(h0)) { seen.add(h0.month + '/' + h0.day); if (f.days === 0) bad.push('today forbidden ' + i); }
      keys.add(f.key);
      // after the cut-off today is behind us, except Ramadan, which stays
      const late = fastingNext(new Date(noon + 4 * 3600000));   // 19:00 in Riyadh
      if (late.days === 0 && late.key !== 'ramadan') bad.push('late today ' + i);
    }
    return { n, bad: bad.slice(0, 5), seen: [...seen].sort(), keys: [...keys].sort() };
  });
  check(`fasting: ${r.n} days, never a forbidden day, always the earliest recommended`, !errors.length && !r.bad.length, JSON.stringify(r));
  check('fasting: all five forbidden days came up as «today» and were skipped', r.seen.join() === '10/1,12/10,12/11,12/12,12/13', r.seen.join());
  check('fasting: every kind of day was suggested at some point', r.keys.join() === 'arafah,ashura,mon,ramadan,shawwal,tasua,thu,white', r.keys.join());
  const at = async iso => { await p.evaluate(FAKE_NOW(iso) + '; renderSlot();'); return slotText(p); };
  const cases = [
    ['2027-05-15T09:00:00Z', 'يوم عرفة اليوم'],                  // 9 Dhul-Hijjah
    ['2027-05-14T09:00:00Z', 'يوم عرفة غدًا السبت'],
    ['2027-05-16T09:00:00Z', 'الأيام البيض بعد ٤ أيام'],         // Eid and Tashreeq skipped: 14 Dhul-Hijjah
    ['2027-02-10T09:00:00Z', 'صيام رمضان اليوم ٣ من رمضان'],
    ['2027-02-10T17:00:00Z', 'صيام رمضان اليوم ٣ من رمضان'],
    ['2027-03-09T09:00:00Z', 'ست من شوال غدًا الأربعاء'],        // Eid al-Fitr: tomorrow, the six of Shawwal
    ['2026-10-22T09:00:00Z', 'صيام الخميس اليوم'],
    ['2026-10-22T17:00:00Z', 'الأيام البيض بعد يومين'],
  ];
  for (const [iso, want] of cases) { const t = await at(iso); check(`fasting at ${iso}: ${want}`, t.label === 'الصيام' && t.row === want, JSON.stringify(t)); }
  await ctx.close();
}
{   // countdown: days to the date, «اليوم» on it, the weather once it has passed; the name is escaped
  const name = encodeURIComponent('رحلة <b>الصيف</b>');
  const { p, ctx, errors } = await open('tv.html', `slot=countdown&cd=2026-12-01&cdname=${name}`);
  const at = async iso => { await p.evaluate(FORECAST_5 + FAKE_NOW(iso) + '; renderSlot();'); return slotText(p); };
  let t = await at('2026-10-22T09:00:00Z');
  check('countdown: «٤٠ يوم» and the name, escaped', t.label === 'عدّ تنازلي' && t.row === '٤٠ يوم رحلة <b>الصيف</b>', JSON.stringify(t));
  check('countdown: no element made from the name', await p.evaluate(() => !document.querySelector('#match-row b')));
  t = await at('2026-11-30T21:30:00Z');   // 00:30 on the 1st in Riyadh
  check('countdown: «اليوم» on the day', t.row.startsWith('اليوم'), JSON.stringify(t));
  t = await at('2026-12-01T22:00:00Z');   // the 2nd in Riyadh
  check('countdown: after the date, the weather instead', t.label === 'الطقس', JSON.stringify(t));
  check('countdown: no script errors', !errors.length, errors.join('; '));
  await ctx.close();
  for (const [h, why] of [['cd=2026-13-45', 'a bad date'], ['cd=nonsense', 'text'], ['', 'no date']]) {
    const r = await open('tv.html', 'slot=countdown&' + h);
    const got = await r.p.evaluate(() => [CONFIG.cd, slotNow()]);
    check(`countdown with ${why}: the weather`, got[0] === '' && got[1] === 'weather', got.join());
    await r.ctx.close();
  }
}
// none: the left panel is gone and the other two share the row, at three sizes
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', 'slot=none', { width, height });
  const r = await p.evaluate(() => {
    const b = document.querySelector('.bottom').getBoundingClientRect(), pr = document.querySelector('.p-prayer').getBoundingClientRect(),
          mid = document.querySelector('.p-mid').getBoundingClientRect();
    return { hidden: getComputedStyle(document.querySelector('.p-match')).display === 'none',
             inside: pr.right <= b.right + 1 && mid.left >= b.left - 1, apart: mid.right <= pr.left + 1,
             used: (pr.right - mid.left) / b.width };
  });
  check(`slot none at ${width}px: left panel hidden, the two others share the row`, !errors.length && r.hidden && r.inside && r.apart && r.used > .95, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}
// the matches timers and requests belong to the matches slot (and to the card beside the clock)
for (const [hash, asks] of [['teams=136013', true], ['teams=136013&slot=weather', false], ['teams=136013&slot=none', false], ['teams=', false], ['teams=136013&slot=weather&panel=matches', true]]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  let sports = 0;
  await ctx.route(/^https?:/, r => { if (/thesportsdb/.test(r.request().url())) sports++; return r.abort(); });
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#' + hash);
  await p.waitForTimeout(800);
  check(`link #${hash}: matches data ${asks ? 'asked' : 'not asked'}`, (sports > 0) === asks, String(sports));
  await ctx.close();
}
// the card beside the clock: an upcoming game has «السبت ٢٤ أكتوبر · ٩:١٦ م» under its teams, at every size and card style
for (const [width, height, style] of [[1920, 1080, ''], [1280, 720, ''], [960, 540, ''], [1920, 1080, 'dark1'], [1920, 1080, 'glass1'],
                                      [1920, 1080, 'dark3'], [1920, 1080, 'glass3'], [1280, 720, 'dark3'], [960, 540, 'glass3']]) {
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=matches' + (style ? '&cardstyle=' + style : ''), { width, height });
  const r = await p.evaluate(() => {
    const T = Date.parse('2026-10-21T18:16:00Z'), R = Date;
    window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
    const names = [['Al-Hilal', 'Al-Nassr'], ['Manchester City', 'Real Madrid'], ['Barcelona', 'Liverpool'], ['Arsenal', 'Chelsea'], ['Inter', 'Milan']];
    NEXT_LIST['136013'] = names.map(([a, b], i) => ({ idEvent: 'm' + i, strHomeTeam: a, strAwayTeam: b, strStatus: 'NS',
      strTimestamp: new Date(Date.parse('2026-10-24T18:16:00Z') + i * 86400000).toISOString() }));
    renderPanel(false);
    const card = document.querySelector('.week'), c = card.getBoundingClientRect(), lis = [...card.querySelectorAll('li')];
    const wh = lis.map(li => (li.querySelector('.mwhen') || {}).textContent);
    const clipped = [...card.querySelectorAll('li > span')].filter(e => e.scrollWidth > e.clientWidth + 1).length;
    const bar = document.querySelector('.bottom').getBoundingClientRect();
    return { wh, rows: lis.length, clipped, within: c.bottom < bar.top - 4 && c.height < .42 * innerHeight && c.left >= 0,
             dt: lis[0].querySelector('.dt').textContent };
  });
  check(`matches card at ${width}x${height}${style ? ' ' + style : ''}: date and time under each game, nothing clipped`,
    !errors.length && r.wh[0] === 'السبت ٢٤ أكتوبر · ٩:١٦ م' && r.wh[1].startsWith('الأحد') && r.rows === 4 && !r.clipped && r.within && r.dt === 'بعد ٣ أيام', JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}


// ---- slot=markets: the chosen markets with price and change in the bottom-left slot (arrows-only top left)
{
  const { p, ctx, errors } = await open('tv.html', 'slot=markets&markets=tasi,gold,btc', { net: marketNet({}) });
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => ({ label: document.getElementById('slot-label').textContent,
    rows: [...document.querySelectorAll('#match-row .mblock')].map(b => b.innerText.replace(/\s+/g, ' ').trim()) }));
  check('slot markets: label, three markets with price and change', !errors.length && r.label === 'الأسواق' && r.rows.length === 3
    && r.rows[0].includes('تاسي') && r.rows[0].includes('١١٬٥٠٠') && r.rows[0].includes('▲') && r.rows[1].includes('الذهب') && r.rows[2].includes('▼'),
    JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- the national days: 23 September (shown 21-25) and 22 February (shown 20-24), Riyadh time; #national=off turns them off
{
  const snap = p => p.evaluate(() => ({ nat: document.documentElement.classList.contains('nat'),
    line: document.getElementById('natline').hidden ? '' : document.getElementById('natline').textContent,
    label: document.getElementById('occ-label').textContent, big: document.getElementById('occ-days').textContent.trim(),
    gold: getComputedStyle(document.querySelector('.week .hd')).color }));
  const at = async (hash, iso) => {
    const r = await open('tv.html', hash);
    await r.p.evaluate(FAKE_NOW(iso) + '; tickDates(); tickOccasion();');
    return r;
  };
  const lum = c => { const [R, G, B] = c.match(/\d+/g).slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
    return .2126 * R + .7152 * G + .0722 * B; };
  const cases = [   // [what, hash, UTC instant, look on?, line, middle panel is the greeting?]
    ['21 Sep 00:30 Riyadh (first shown hour)', '', '2026-09-20T21:30:00Z', true, 'اليوم الوطني السعودي ٩٦', false],
    ['22 Sep', '', '2026-09-22T09:00:00Z', true, 'اليوم الوطني السعودي ٩٦', false],
    ['23 Sep itself', '', '2026-09-23T09:00:00Z', true, 'اليوم الوطني السعودي ٩٦', true],
    ['25 Sep 23:30 Riyadh (last shown hour)', '', '2026-09-25T20:30:00Z', true, 'اليوم الوطني السعودي ٩٦', false],
    ['26 Sep 00:30 Riyadh (over)', '', '2026-09-25T21:30:00Z', false, '', false],
    ['20 Sep (not yet)', '', '2026-09-20T09:00:00Z', false, '', false],
    ['23 Sep, 2031 (the count follows the year)', '', '2031-09-23T09:00:00Z', true, 'اليوم الوطني السعودي ١٠١', true],
    ['20 Feb', '', '2026-02-20T09:00:00Z', true, 'يوم التأسيس ٢٩٩ عامًا', false],
    ['22 Feb itself', '', '2026-02-22T09:00:00Z', true, 'يوم التأسيس ٢٩٩ عامًا', true],
    ['24 Feb', '', '2026-02-24T09:00:00Z', true, 'يوم التأسيس ٢٩٩ عامًا', false],
    ['25 Feb (over)', '', '2026-02-25T09:00:00Z', false, '', false],
    ['an ordinary day', '', '2026-10-22T09:00:00Z', false, '', false],
    ['23 Sep with #national=off', 'national=off', '2026-09-23T09:00:00Z', false, '', false],
    ['22 Feb with #national=off', 'national=off', '2026-02-22T09:00:00Z', false, '', false],
    ['23 Sep with #national=bogus (= auto)', 'national=bogus', '2026-09-23T09:00:00Z', true, 'اليوم الوطني السعودي ٩٦', true],
    ['23 Sep, latin digits', 'digits=latin', '2026-09-23T09:00:00Z', true, 'اليوم الوطني السعودي 96', true],
  ];
  for (const [what, hash, iso, on, line, greet] of cases) {
    const { p, ctx, errors } = await at(hash, iso);
    const r = await snap(p);
    check(`national: ${what}`, !errors.length && r.nat === on && r.line === line
      && (r.big === 'كل عام والوطن بخير') === greet && (!greet || r.label === 'اليوم الوطني' || r.label === 'يوم التأسيس'),
      JSON.stringify(r) + errors.join('; '));
    if (!on) check(`national: ${what}: gold accent unchanged`, r.gold === 'rgb(214, 175, 107)', r.gold);
    await ctx.close();
  }
  {   // the green stays readable on the dark page (WCAG AA for text, 4.5:1) and is not the flag
    const { p, ctx } = await at('', '2026-09-23T09:00:00Z');
    const r = await p.evaluate(() => ({ hd: getComputedStyle(document.querySelector('.week .hd')).color,
      line: getComputedStyle(document.getElementById('natline')).color, flag: !!document.querySelector('img[src*="flag"],[class*="flag"]') }));
    const bg = lum('rgb(4, 14, 9)');
    for (const k of ['hd', 'line']) {
      const c = (lum(r[k]) + .05) / (bg + .05);
      check(`national: ${k} text contrast on the dark page is ${c.toFixed(1)}:1`, c >= 4.5 && !r.flag, r[k]);
    }
    await ctx.close();
  }
  for (const [w, h] of [[1920, 1080], [960, 540]]) {   // nothing off screen or colliding, and a picture for the owner
    const { p, ctx } = await at('teams=136013&panel=verse', '2026-09-23T09:00:00Z');
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const top = document.querySelector('.top').getBoundingClientRect(),
      ln = document.getElementById('natline').getBoundingClientRect(), mid = document.querySelector('.p-mid').getBoundingClientRect();
      return { lineIn: ln.right <= innerWidth && ln.left >= 0, topOk: top.bottom < innerHeight * .3, midIn: mid.left >= 0 && mid.right <= innerWidth,
        txt: document.querySelector('#occ-days .txt').getBoundingClientRect().height < mid.height }; });
    check(`national ${w}x${h}: the line and the greeting fit`, r.lineIn && r.topOk && r.midIn && r.txt, JSON.stringify(r));
    if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, `national-${w}x${h}.png`) });
    await ctx.close();
  }
}

// ---- 20 followed teams: the slot pages through all of them, two at a time, and the card pages its rows
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const ids = Array.from({ length: 22 }, (_, i) => 900100 + i);
  const { p, ctx, errors } = await open('tv.html', 'teams=' + ids.join(',') + '&panel=matches', { width, height });
  const r = await p.evaluate(() => {
    const NAMES = 'Arsenal Barcelona Chelsea Dortmund Everton Fulham Genoa Hertha Inter Juventus Lazio Milan Napoli Osasuna Porto Roma Sevilla Torino Udinese Valencia'.split(' ');
    const ids = CONFIG.teamIds;
    ids.forEach((id, i) => { MATCHES[id] = { idEvent: 'e' + i, idHomeTeam: String(id), strHomeTeam: NAMES[i],
      idAwayTeam: 'x' + i, strAwayTeam: NAMES[19 - i] + ' B', strTimestamp: new Date(Date.now() + (i + 1) * 36e5).toISOString() }; });
    MATCHES_LOADED = true;
    const seen = new Set(), bad = [], row = document.getElementById('match-row');
    MATCH_PAGE = -1;
    for (let k = 0; k < 12; k++) {
      renderMatches(true);
      row.querySelectorAll('.mblock .big').forEach(b => seen.add(b.innerText));
      const b = row.getBoundingClientRect();
      if (b.left < -2 || b.right > innerWidth + 2 || b.bottom > innerHeight + 2) bad.push(k);
    }
    return { teams: ids.length, shown: seen.size, bad };
  });
  check(`20 teams at ${width}x${height}: capped, all paged through, on screen`,
    !errors.length && r.teams === 20 && r.shown === 20 && !r.bad.length, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- other sports, with TheSportsDB answers mocked: an NBA game, an NFL game, an F1 weekend, a UFC card
{
  const at = h => new Date(Date.now() + h * 36e5).toISOString().slice(0, 19);
  const game = (id, sport, h, a, hid, aid, hrs) => ({ idEvent: id, strSport: sport, idHomeTeam: hid, strHomeTeam: h,
    idAwayTeam: aid, strAwayTeam: a, strTimestamp: at(hrs), strStatus: 'NS', intHomeScore: null, intAwayScore: null });
  const NEXT = {
    '900001': [game('n1', 'Basketball', 'Los Angeles Lakers', 'Golden State Warriors', '900001', '900002', 5)],
    '900003': [game('f1', 'American Football', 'Kansas City Chiefs', 'San Francisco 49ers', '900003', '900004', 30)],
  };
  const F1 = [['Saudi Arabian Grand Prix Practice 1', 3], ['Saudi Arabian Grand Prix Qualifying', 27],
              ['Saudi Arabian Grand Prix Sprint', 30], ['Saudi Arabian Grand Prix', 51]]
    .map(([n, h], i) => ({ idEvent: 'r' + i, strEvent: n, strCountry: 'Saudi Arabia', strTimestamp: at(h), strStatus: 'NS' }));
  // the shapes TheSportsDB really answers (CI report): UFC «UFC 333 Volkanovski vs Evloev», boxing with no time of day
  const UFC = [{ idEvent: 'u1', strEvent: 'UFC 333 Volkanovski vs Evloev', strCountry: 'United Arab Emirates', strTime: '16:00:00',
                 strTimestamp: at(60), strStatus: 'NS' },
               { idEvent: 'u2', strEvent: 'UFC Fight Night 291 Buckley vs Malott', strCountry: 'Canada', strTime: '21:00:00',
                 strTimestamp: at(200), strStatus: 'NS' }];
  const day = new Date(Date.now() + 30 * 36e5).toISOString().slice(0, 10);
  const BOX = [{ idEvent: 'b1', strEvent: 'Dalton Smith vs Alberto Puello', strCountry: 'United Kingdom', strTime: '00:00:00',
                 strTimestamp: day + 'T00:00:00', dateEvent: day, strStatus: 'NS' }];
  const mock = r => {
    const u = new URL(r.request().url());
    if (!/thesportsdb/.test(u.host)) return r.abort();
    const id = u.searchParams.get('id'), body = j => r.fulfill({ json: j, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.pathname.endsWith('eventsnext.php')) return body({ events: NEXT[id] || null });
    if (u.pathname.endsWith('eventsnextleague.php')) return body({ events: { E1: F1, E2: UFC, E3: BOX }[id] || null });
    return body({ results: null });
  };
  for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.route(/^https?:/, mock);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(page('tv.html') + '#teams=900001,900003&events=f1,ufc,boxing&panel=matches');
    await p.evaluate(() => { EVENT_LEAGUES.f1 = [{ id: 'E1', name: 'Formula 1' }]; EVENT_LEAGUES.ufc = [{ id: 'E2', name: 'UFC' }];
                             EVENT_LEAGUES.boxing = [{ id: 'E3', name: 'Boxing' }]; });
    await p.evaluate(() => loadMatches());
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const row = document.getElementById('match-row'), seen = [], bad = [];
      MATCH_PAGE = -1;
      for (let k = 0; k < 4; k++) {
        renderMatches(true);
        row.querySelectorAll('.mblock').forEach(b => {
          seen.push(b.innerText.replace(/\s+/g, ' ').trim());
          const big = b.querySelector('.big > span');
          const rg = document.createRange(), cs = getComputedStyle(big); rg.selectNodeContents(big);   // as fitMatches measures
          if (rg.getBoundingClientRect().width > big.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + .5)
            bad.push('overflow: ' + big.textContent);
        });
        const b = row.getBoundingClientRect();
        if (b.left < -2 || b.right > innerWidth + 2 || b.bottom > innerHeight + 2) bad.push('off screen ' + k);
      }
      const card = matchRows().map(h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); });
      const shown = [], cut = [];
      for (let k = 0; k < card.length; k++) {   // every page of the card
        CARDS[0].page = k; renderPanel(false);
        document.querySelectorAll('#week-list li > span:first-child').forEach(sp => { shown.push(sp.textContent); if (!fits(sp)) cut.push(sp.textContent); });
      }
      return { seen, bad, card, cardRows: new Set(shown).size, cardCut: [...new Set(cut)] };
    });
    const all = r.seen.join(' | ');
    const tag = `${width}x${height}`;
    check(`${tag}: no script errors`, !errors.length, errors.join('; '));
    // in the slot two games share the row, so the names may take the nickname alone; the card has room for them whole
    check(`${tag}: NBA game in Arabic`, (all.includes('لوس أنجلوس ليكرز × غولدن ستيت ووريورز') || all.includes('ليكرز × ووريورز'))
      && r.card.some(c => c.includes('لوس أنجلوس ليكرز × غولدن ستيت ووريورز')), all + ' / ' + r.card.join(' | '));
    check(`${tag}: NFL game in Arabic`, (all.includes('كانساس سيتي تشيفز × سان فرانسيسكو فورتي ناينرز') || all.includes('تشيفز × فورتي ناينرز'))
      && r.card.some(c => c.includes('كانساس سيتي تشيفز × سان فرانسيسكو فورتي ناينرز')), all + ' / ' + r.card.join(' | '));
    check(`${tag}: F1: the Grand Prix on the big line, the next session under it`, /جائزة السعودية( الكبرى)? التجارب الحرة ١/.test(all), all);
    check(`${tag}: UFC: the fighters on the big line, the card's number and country under it`,
      /× [^|]* UFC ٣٣٣ · الإمارات/.test(all) && !/[A-Za-z]/.test(all.replace(/UFC/g, '')), all);
    check(`${tag}: a boxing card with no time tells the day only`, all.includes('ملاكمة') && !/ملاكمة[^|]*[٠-٩]+:[٠-٩]+/.test(all), all);
    check(`${tag}: nothing off screen, every name whole on one line (no «…»)`, !r.bad.length && !all.includes('…'), r.bad.join(',') + ' ' + all);
    check(`${tag}: the card beside the clock: every row on one line, long names in their short form`, r.cardRows > 0 && !r.cardCut.length, JSON.stringify(r.cardCut));
    check(`${tag}: the card lists the F1 weekend (practice, qualifying, sprint, race)`,
      ['التجارب الحرة ١', 'التأهل', 'السبرنت', 'السباق'].every(x => r.card.some(c => c.includes('جائزة السعودية الكبرى · ' + x))), r.card.join(' | '));
    await ctx.close();
  }
}

// ---- from 10 to 12 o'clock the clock has four digits: in the TV's own font (ours not loaded: offline, or blocked) it is
// wider, and beside the card it pushed the whole screen wider than the TV's; the bottom row slid off the left edge at 1280
// and 960 (a failure seen only between 10 and 1 in Riyadh)
const noFont = r => /\/assets\/fonts\//.test(r.request().url()) && (r.abort(), true);
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=matches', { width, height, now: '2026-10-23T08:58:00Z', net: noFont });   // ١١:٥٨ ص
  const r = await p.evaluate(() => {
    const long = 'بوروسيا مونشنغلادباخ × كلوب دو فوت مونتريال · الجمعة ٢٣ أكتوبر · ١١:٠٥ م';
    document.getElementById('week-list').innerHTML = [1, 2, 3, 4].map(() => `<li><span>${long}</span><span>بعد ١ يوم و ٥ ساعات</span></li>`).join('');
    const box = s => document.querySelector(s).getBoundingClientRect();
    const off = ['.mid', '.bottom', '.p-match', '.p-prayer', '.clockwrap'].filter(s => { const b = box(s); return b.left < -2 || b.right > innerWidth + 2; });
    return { off, clock: document.getElementById('ck-h').textContent + ':' + document.getElementById('ck-m').textContent };
  });
  check(`four-digit clock (${r.clock}) beside a card of long rows at ${width}x${height}: nothing wider than the screen; no script errors`,
    !errors.length && r.clock === '١١:٥٨' && !r.off.length, JSON.stringify({ ...r, errors }));
  await ctx.close();
}

// ---- the framed styles (dark3, glass3): the two diamonds on the frame never sit on the text, whatever the card and the size
for (const [width, height] of [[1920, 1080], [960, 540]]) for (const st of ['dark3', 'glass3']) {
  const bad = [], errs = [];
  for (const panel of ['verse', 'matches', 'year', 'prayers', 'hourly', 'prayerrow', 'today', 'stocks', 'tasks', 'wisdom', 'adhkar', 'shows']) {
    const { p, ctx, errors } = await open('tv.html', `teams=136013&stocks=2222&panel=${panel}&cardstyle=${st}`, { width, height, now: '2026-10-23T10:00:00Z' });
    errs.push(...errors);
    const hit = await p.evaluate(() => {
      const dias = [...document.querySelectorAll('.week .dia')].map(d => d.getBoundingClientRect());
      const rg = document.createRange(), out = [];
      const walk = document.createTreeWalker(document.querySelector('.week'), NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (!n.textContent.trim()) continue;
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) for (const d of dias)
          if (r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top) out.push(n.textContent.trim().slice(0, 20));
      }
      return [...new Set(out)];
    });
    if (hit.length) bad.push(`${panel}: ${hit.join(', ')}`);
    await ctx.close();
  }
  check(`${st} at ${width}x${height}: the diamonds touch no text on any card; no script errors`, !bad.length && !errs.length, bad.join(' | ') + ' ' + errs.join('; '));
}

// ---- club crests on the launcher's matches card (widget mode only), with the badge host mocked
// a 120 px round badge as a PNG, so the page has a picture to shrink
const badgePng = (() => {
  const W = 120, raw = Buffer.alloc((W * 4 + 1) * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = y * (W * 4 + 1) + 1 + x * 4, inside = (x - 60) ** 2 + (y - 60) ** 2 < 56 ** 2;
    raw.set(inside ? [30, 120, 70, 255] : [0, 0, 0, 0], o);
  }
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let r = 0xFFFFFFFF; for (const v of b) r = t[(r ^ v) & 255] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length); h.write(type, 4);
    const t = Buffer.concat([h.subarray(4), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([h.subarray(0, 4), t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
const BADGE = n => `https://r2.thesportsdb.com/images/media/team/badge/club${n}.png`;
const crestNet = seen => r => {
  const u = r.request().url();
  if (!/thesportsdb\.com\/images\//.test(u)) return false;
  seen.push(u);
  r.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: badgePng });
  return true;
};
const CREST_GAMES = (names) => `NEXT_LIST = { '136013': ${JSON.stringify(names.map(([h, a, hb, ab], i) => ({
  idEvent: 'c' + i, strHomeTeam: h, strAwayTeam: a, idHomeTeam: String(100 + 2 * i), idAwayTeam: String(101 + 2 * i),
  strHomeTeamBadge: hb ? BADGE(100 + 2 * i) : null, strAwayTeamBadge: ab ? BADGE(101 + 2 * i) : null,
  strTimestamp: new Date(Date.now() + (3 + 30 * i) * 36e5).toISOString() })))} };`;
const SHORT_GAMES = [['Al-Hilal', 'Al-Nassr', true, true], ['Al-Ahli', 'Al-Ittihad', true, false]];   // the second game's guest has no crest
const LONG_GAMES = [['Manchester United', 'Borussia Monchengladbach', true, true], ['Paris Saint-Germain', 'Bayern Munich', true, true],
                    ['Real Madrid', 'Manchester City', true, true]];
for (const [width, height] of [[461, 250], [1920, 1080], [1280, 720], [960, 540]]) {
  const tag = `launcher matches card ${width}x${height}`;
  const seen = [];
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=matches&widget=1', { width, height, net: crestNet(seen) });
  await p.evaluate(CREST_GAMES(SHORT_GAMES) + ' renderPanel(false);');
  const before = await p.evaluate(() => document.querySelectorAll('#week-list img.cr').length);
  await p.evaluate(() => loadCrests());
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('#week-list img.cr')];
    const rows = [...document.querySelectorAll('#week-list li > span:first-child')];
    return { n: imgs.length, shown: imgs.every(i => i.src.startsWith('data:image/png') && i.naturalWidth > 0 && i.naturalWidth <= 48 && i.getBoundingClientRect().width > 8),
      stored: Object.keys(JSON.parse(localStorage.getItem('crests') || '{}')).sort().join(),
      bytes: (localStorage.getItem('crests') || '').length,
      names: rows.map(sp => sp.querySelectorAll('.tm').length),
      noCrestHasName: rows[1].querySelectorAll('.tm')[1].querySelector('img') === null && rows[1].querySelectorAll('.tm')[1].textContent.trim().length > 2,
      oneLine: rows.every(sp => { const t = [...sp.querySelectorAll('.tm')].map(x => x.getClientRects().length === 1 && Math.round(x.getBoundingClientRect().top));
                                  return t.every(Boolean) && Math.abs(t[0] - t[1]) < 6 && fits(sp); }),
      cut: document.getElementById('week-list').textContent.includes('…') };
  });
  const asked = seen.length;
  await p.evaluate(() => loadCrests());
  await p.waitForTimeout(100);
  check(`${tag}: no script errors`, !errors.length, errors.join('; '));
  check(`${tag}: crests appear after they are fetched, small, and a club without one shows its name alone`,
    before === 0 && r.n === 3 && r.shown && r.stored === '100,101,102' && r.noCrestHasName, JSON.stringify({ before, ...r }));
  check(`${tag}: kept small in memory (${r.bytes} bytes for 3)`, r.bytes < 3 * 6000, String(r.bytes));
  check(`${tag}: each game on one line, nothing cut`, r.oneLine && !r.cut, JSON.stringify(r));
  check(`${tag}: one request per crest, none for the same crest again`, asked === 3 && seen.length === 3, JSON.stringify(seen));
  // a restart: the rows and crests come back from the saved copy with no request
  await p.evaluate(() => saveSnap());
  await restart(p);
  await p.waitForTimeout(500);
  const back = await p.evaluate(() => [...document.querySelectorAll('#week-list img.cr')].filter(i => i.src.startsWith('data:image/png')).length);
  check(`${tag}: after a restart the crests are back at once, from the saved copy`, back === 3 && seen.length === 3, back + ' ' + seen.length);
  await ctx.close();
}
{   // the screensaver itself, and every other card, show no crest
  const seen = [];
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=matches', { net: crestNet(seen) });
  await p.evaluate(CREST_GAMES(SHORT_GAMES) + ' renderPanel(false); loadCrests();');
  await p.waitForTimeout(200);
  check('the screensaver shows no crest and asks for none', !errors.length && seen.length === 0
    && await p.evaluate(() => !document.querySelector('img.cr')), seen.join());
  await ctx.close();
}
for (const [width, height] of [[461, 250], [1920, 1080], [1280, 720], [960, 540]]) {
  for (const digits of ['hindi', 'latin']) {
    const tag = `launcher matches card ${width}x${height} ${digits}`;
    const seen = [];
    const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=matches&widget=1&digits=' + digits, { width, height, net: crestNet(seen) });
    await p.evaluate(CREST_GAMES(LONG_GAMES) + ' renderPanel(false); loadCrests();');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#week-list li > span:first-child')], text = document.getElementById('week-list').innerText;
      return { n: rows.length, imgs: document.querySelectorAll('#week-list img.cr').length, text: text.replace(/\s+/g, ' '),
        oneLine: rows.every(sp => [...sp.querySelectorAll('.tm')].every(x => x.getClientRects().length === 1) && fits(sp)),
        ar: /[٠-٩]/.test(text), latin: /[0-9]/.test(text) };
    });
    check(`${tag}: long names with crests, each game on one line, never «…»`, !errors.length && r.n >= 2 && r.oneLine && !r.text.includes('…'), JSON.stringify(r) + errors.join('; '));
    check(`${tag}: digits in ${digits}`, digits === 'latin' ? r.latin && !r.ar : r.ar && !r.latin, r.text);
    await ctx.close();
  }
}

// ---- «طقس الساعات القادمة»: the next six hours beside the clock and on the launcher's card, one request with the forecast
{
  const hourlyAnswer = () => {   // Open-Meteo's answer for Riyadh (UTC+3): 48 hours from this hour, mixed weather, a sunset at 18:00
    const t0 = Math.floor((Date.now() + 3 * 36e5) / 36e5) * 36e5, hr = { time: [], temperature_2m: [], weather_code: [] };
    const codes = [0, 1, 2, 3, 45, 61, 71, 95, 0, 2];
    for (let k = 0; k < 48; k++) { hr.time.push(new Date(t0 + k * 36e5).toISOString().slice(0, 16)); hr.temperature_2m.push(31.4 - k * .6); hr.weather_code.push(codes[k % codes.length]); }
    const days = [0, 1, 2, 3, 4].map(i => new Date(t0 + i * 864e5).toISOString().slice(0, 10));
    return JSON.stringify({ current: { temperature_2m: 31, weather_code: 0 }, hourly: hr,
      daily: { time: days, temperature_2m_max: days.map(() => 37), temperature_2m_min: days.map(() => 24), weather_code: days.map(() => 0),
               sunrise: days.map(d => d + 'T05:50'), sunset: days.map(d => d + 'T18:00') } });
  };
  const weatherNet = asked => r => {
    const u = r.request().url();
    if (!/api\.open-meteo\.com\/v1\/forecast/.test(u)) return false;
    asked.push(u);
    if (asked.off) { r.abort(); return true; }   // the network is gone
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: hourlyAnswer() });
    return true;
  };
  for (const [file, hash, width, height, label] of [['tv.html', 'panel=hourly', 1920, 1080, 'beside the clock'], ['tv.html', 'panel=hourly', 1280, 720, 'beside the clock'],
      ['tv.html', 'panel=hourly', 960, 540, 'beside the clock'], ['urtv.html', 'panel=hourly', 1920, 1080, 'screensaver page'],
      ['tv.html', 'panel=hourly&widget=1', 461, 250, 'launcher card'], ['tv.html', 'panel=hourly&widget=1', 1920, 1080, 'launcher card'],
      ['tv.html', 'panel=hourly&widget=1', 960, 540, 'launcher card']]) {
    for (const digits of ['hindi', 'latin']) {
      const asked = [];
      const { p, ctx, errors } = await open(file, hash + '&digits=' + digits, { width, height, net: weatherNet(asked) });
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const cells = [...document.querySelectorAll('#week-list .hc')], card = document.querySelector('.week').getBoundingClientRect();
        const text = document.getElementById('week-list').innerText;
        return { n: cells.length, hd: document.getElementById('week-hd').textContent,
          icons: cells.every(c => c.querySelector('svg path, svg circle')),
          times: cells.map(c => c.querySelector('b').textContent), temps: cells.map(c => c.querySelector('i').textContent),
          oneLine: cells.every(c => [...c.querySelectorAll('b,i')].every(x => x.getClientRects().length === 1)),
          inside: cells.every(c => { const b = c.getBoundingClientRect(); return b.left >= card.left - 1 && b.right <= card.right + 1; }),
          sameSize: new Set(cells.map(c => Math.round(c.getBoundingClientRect().width))).size <= 2,
          ar: /[٠-٩]/.test(text), latin: /[0-9]/.test(text),
          night: [...cells].map(c => c.querySelector('svg').innerHTML.includes('M19 14.3') || c.querySelector('svg').innerHTML.includes('M10.5 3.5')) };
      });
      const tag = `hourly card ${label} ${file} ${width}x${height} ${digits}`;
      const wantAt = ms => Array.from({ length: 6 }, (_, k) => { const h = (Math.floor((ms + 3 * 36e5) / 36e5) + 1 + k) % 24; return (h % 12 || 12) + ' ' + (h < 12 ? 'ص' : 'م'); });
      const want = wantAt(Date.now() - 3000), wantNow = wantAt(Date.now());   // the hour may have turned while the page was drawn
      const toLatin = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      check(`${tag}: no script errors, six hours with an icon each, titled`, !errors.length && r.n === 6 && r.icons && r.hd === 'الساعات القادمة', JSON.stringify(r) + errors.join('; '));
      check(`${tag}: the next six full hours, in order`, [want, wantNow].some(w => JSON.stringify(r.times.map(toLatin)) === JSON.stringify(w)), JSON.stringify([r.times, want]));
      check(`${tag}: temperatures in degrees, falling as the answer says`, r.temps.every(x => /°$/.test(x)) && toLatin(r.temps[0]) !== toLatin(r.temps[5]), r.temps.join(' '));
      check(`${tag}: one line each, inside the card, ${digits} digits`, r.oneLine && r.inside && (digits === 'latin' ? r.latin && !r.ar : r.ar && !r.latin), JSON.stringify(r));
      check(`${tag}: one weather request, asking for the hours with the days`, asked.length === 1 && /hourly=temperature_2m,weather_code/.test(asked[0]) && /daily=[^&]*sunset/.test(asked[0]), asked.join('\n'));
      await ctx.close();
    }
  }
  {   // day and night icons follow the sun: after sunset the moon, before it the sun; the plain forecast asks for no hours
    const asked = [];
    const { p, ctx } = await open('tv.html', 'panel=hourly&widget=1', { width: 461, height: 250, net: weatherNet(asked) });
    const r = await p.evaluate(() => { SUN = { '2026-10-23': ['05:50', '18:00'] }; return ['2026-10-23T17:00', '2026-10-23T18:00', '2026-10-23T04:00', '2026-10-23T06:00'].map(isNight); });
    check('hourly icons: night after sunset and before sunrise, day between', JSON.stringify(r) === '[false,true,true,false]', JSON.stringify(r));
    await ctx.close();
    const plain = [];
    const f = await open('tv.html', 'panel=forecast', { net: weatherNet(plain) });
    await f.p.waitForTimeout(300);
    check('forecast card: no hours asked for, as before', plain.length === 1 && !/hourly|sunset/.test(plain[0]), plain.join('\n'));
    await f.ctx.close();
  }
  {   // offline start: the saved hours are shown at once
    const asked = [];
    const { p, ctx } = await open('tv.html', 'panel=hourly&widget=1', { width: 461, height: 250, net: weatherNet(asked) });
    await p.waitForTimeout(400);
    asked.off = true;
    await restart(p);
    await p.waitForTimeout(300);
    check('hourly card: after a restart the hours are there at once from the saved copy', await p.evaluate(() => document.querySelectorAll('#week-list .hc').length) === 6);
    await ctx.close();
  }
}

// ---- «الصلوات في صف»: five prayers in one row, the next lit, «المغرب بعد ١ س و ٥ د» above, with the clock held still
{
  const TIMES = "buildPrayers({Fajr:'04:50',Sunrise:'06:05',Dhuhr:'11:40',Asr:'15:00',Maghrib:'17:45',Isha:'19:15'});";
  // Riyadh is UTC+3: 13:40 UTC = 16:40 there, so Maghrib (17:45) is 1 h 5 min away; 2026-10-23 is a Friday, 2026-10-22 a Thursday
  for (const [when, next, head, label] of [
      ['2026-10-22T13:40:00Z', 3, 'المغرب بعد ١ س و ٥ د', 'Thursday afternoon'],
      ['2026-10-23T13:40:00Z', 3, 'المغرب بعد ١ س و ٥ د', 'Friday afternoon'],
      ['2026-10-22T01:00:00Z', 0, 'الفجر بعد ٥٠ د', 'Thursday 04:00 in Riyadh, before Fajr'],
      ['2026-10-22T10:00:00Z', 2, 'العصر بعد ٢ س', 'Thursday 13:00, a whole number of hours'],
      ['2026-10-22T17:10:00Z', 0, 'الفجر بعد ٨ س و ٤٠ د', 'after Isha: tomorrow\'s Fajr'],
      ['2026-10-22T14:40:00Z', 3, 'المغرب بعد ٥ د', 'five minutes before Maghrib']]) {
    for (const [file, hash, width, height] of [['tv.html', 'panel=prayerrow', 1920, 1080], ['tv.html', 'panel=prayerrow', 1280, 720], ['tv.html', 'panel=prayerrow', 960, 540],
        ['urtv.html', 'panel=prayerrow', 1920, 1080], ['tv.html', 'panel=prayerrow&widget=1', 461, 250], ['tv.html', 'panel=prayerrow&widget=1', 960, 540]]) {
      if (file === 'urtv.html' && label !== 'Thursday afternoon') continue;
      for (const digits of (label === 'Thursday afternoon' || label === 'Friday afternoon') ? ['hindi', 'latin'] : ['hindi']) {
        const { p, ctx, errors } = await open(file, hash + '&digits=' + digits, { width, height });
        await p.clock.setFixedTime(new Date(when));
        await p.evaluate(TIMES + ' renderPanel(false);');
        const r = await p.evaluate(() => {
          const cells = [...document.querySelectorAll('#week-list .pc')], card = document.querySelector('.week').getBoundingClientRect(), text = document.getElementById('week-list').innerText;
          return { n: cells.length, hd: document.getElementById('week-hd').textContent, names: cells.map(c => c.querySelector('b').textContent),
            next: cells.map((c, i) => c.classList.contains('next') ? i : -1).filter(i => i >= 0), past: cells.filter(c => c.classList.contains('past')).length,
            oneLine: cells.every(c => [...c.querySelectorAll('b,i')].every(x => x.getClientRects().length === 1)),
            inside: cells.every(c => { const b = c.getBoundingClientRect(); return b.left >= card.left - 1 && b.right <= card.right + 1; }),
            times: cells.map(c => c.querySelector('i').textContent), ar: /[٠-٩]/.test(text), latin: /[0-9]/.test(text),
            litBg: cells.map(c => getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)') };
        });
        const tag = `prayer row ${label} ${file} ${width}x${height} ${hash.includes('widget') ? 'card ' : ''}${digits}`;
        const toLatin = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        const friday = when.startsWith('2026-10-23');
        const headWant = digits === 'latin' ? head.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : head;
        check(`${tag}: five prayers in order, ${friday ? 'الجمعة for Dhuhr' : 'الظهر'}, no script errors`,
          !errors.length && r.n === 5 && r.names.join() === ['الفجر', friday ? 'الجمعة' : 'الظهر', 'العصر', 'المغرب', 'العشاء'].join(), JSON.stringify(r) + errors.join('; '));
        check(`${tag}: the next one lit alone, the ones before it dimmed, «${head}» above`,
          r.next.join() === String(next) && r.hd === headWant && r.litBg[next] && r.litBg.filter(Boolean).length === 1
          && r.past === (next === 0 ? (label.startsWith('after Isha') ? 4 : 0) : next), JSON.stringify(r));
        check(`${tag}: one line each, inside the card, ${digits} digits`, r.oneLine && r.inside && (digits === 'latin' ? r.latin && !r.ar : r.ar && !r.latin)
          && r.times.every(t => /[صم]$/.test(t)), JSON.stringify(r));
        await ctx.close();
      }
    }
  }
  {   // before the times arrive: a title, no row, no errors
    const { p, ctx, errors } = await open('tv.html', 'panel=prayerrow&widget=1', { width: 461, height: 250 });
    check('prayer row with no times yet: no errors', !errors.length, errors.join('; '));
    await ctx.close();
  }
}

// ---- a city outside Saudi Arabia: its own time zone for the clock, the dates (Gregorian and Hijri), the prayers and the
// games. The browser itself is set to New York so that nothing can pass by using the computer's zone.
{
  const hm = (tz, at) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at));
  const digits = s => +s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const cases = [
    // [zone, instant, city line, Dhuhr must fall in this window in minutes since midnight, the same game's time of day]
    ['Asia/Kuwait', '2026-01-15T21:30:00Z', 'city=الكويت&lat=29.3759&lon=47.9774', [11 * 60 + 45, 12 * 60 + 10]],
    ['Africa/Cairo', '2026-01-15T21:30:00Z', 'city=القاهرة&lat=30.0444&lon=31.2357', [11 * 60 + 50, 12 * 60 + 20]],
    ['Africa/Cairo', '2026-07-01T12:00:00Z', 'city=القاهرة&lat=30.0444&lon=31.2357', [12 * 60 + 50, 13 * 60 + 20]],   // summer time: +3
  ];
  const got = {};
  for (const [tz, at, cityq, dhuhr] of cases) {
    for (const file of ['urtv.html', 'tv.html']) {
      const tag = `${file} #tz=${tz} ${at.slice(0, 10)}`;
      const { p, ctx, errors } = await open(file, cityq + '&tz=' + tz, { now: at, tzId: 'America/New_York' });
      const r = await p.evaluate(game => {
        const toMin = s => +s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        const dh = PRAYERS.find(x => x.key === 'Dhuhr');
        return { h: toMin(document.getElementById('ck-h').textContent), m: toMin(document.getElementById('ck-m').textContent),
                 ap: document.getElementById('ck-ap').textContent, greg: document.getElementById('greg').textContent,
                 hijri: document.getElementById('hijri').textContent, dhuhr: dh && dh.h * 60 + dh.mi,
                 game: matchWhen(new Date(game)), tz: CONFIG.timezone,
                 midnight: tzOffsetMs(Date.UTC(2026, 6, 1)) / 36e5 };
      }, '2026-01-15T17:00:00Z');
      const [eh, em] = hm(tz, at).split(':').map(Number);
      check(`${tag}: no script errors`, !errors.length, errors.join('; '));
      check(`${tag}: the clock shows the city's time, not the computer's`,
        r.h === (eh % 12 || 12) && r.m === em && r.ap === (eh < 12 ? 'ص' : 'م'), JSON.stringify(r));
      check(`${tag}: the Hijri date is shown`, /هـ$/.test(r.hijri) && /[٠-٩]/.test(r.hijri) && /\u0640|[ء-ي]{3,}/.test(r.hijri), r.hijri);
      check(`${tag}: Dhuhr (computed offline) at local noon, not Riyadh's`, r.dhuhr >= dhuhr[0] && r.dhuhr <= dhuhr[1], `${r.dhuhr} not in ${dhuhr}`);
      const [gh, gm] = hm(tz, '2026-01-15T17:00:00Z').split(':').map(Number);
      const gameAt = `${gh % 12 || 12}:${String(gm).padStart(2, '0')} ${gh < 12 ? 'ص' : 'م'}`.replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
      check(`${tag}: a game at 17:00 UTC is told in the city's time (${gameAt})`, r.game.endsWith(gameAt), r.game);
      check(`${tag}: the page's zone is #tz=`, r.tz === tz, r.tz);
      if (file === 'tv.html') got[tz + at] = r;
      await ctx.close();
    }
  }
  // the date near midnight differs between the two cities: 21:30 UTC is 00:30 the next day in Kuwait, 23:30 in Cairo
  const k = got['Asia/Kuwait2026-01-15T21:30:00Z'], c = got['Africa/Cairo2026-01-15T21:30:00Z'];
  check('Gregorian and Hijri dates follow the city: Kuwait is a day ahead of Cairo at 21:30 UTC',
    digits(k.greg.match(/[٠-٩]+/)[0]) === digits(c.greg.match(/[٠-٩]+/)[0]) + 1 && digits(k.hijri.match(/[٠-٩]+/)[0]) === digits(c.hijri.match(/[٠-٩]+/)[0]) + 1,
    k.greg + ' / ' + c.greg + ' | ' + k.hijri + ' / ' + c.hijri);
  check('a day without a time starts at midnight in the city (Cairo +3 in July)', got['Africa/Cairo2026-07-01T12:00:00Z'].midnight === 3, got['Africa/Cairo2026-07-01T12:00:00Z'].midnight);
  // no #tz=, or one the browser does not know: Riyadh, as always
  for (const [hash, label] of [['city=الرس&lat=25.86&lon=43.49', 'no #tz='], ['city=الرس&lat=25.86&lon=43.49&tz=Nowhere/Land', 'an unknown #tz=']]) {
    const { p, ctx, errors } = await open('tv.html', hash, { now: '2026-01-15T12:00:00Z', tzId: 'America/New_York' });
    const r = await p.evaluate(() => ({ tz: CONFIG.timezone, h: document.getElementById('ck-h').textContent }));
    check(`${label}: Asia/Riyadh, no errors`, r.tz === 'Asia/Riyadh' && /^[٠-٩]+$/.test(r.h) && !errors.length, JSON.stringify(r) + errors.join(';'));
    await ctx.close();
  }
}
// ---- «السنة»: a dot for every day of the Gregorian year in Riyadh time, passed days lit, today brightest
const yearAt = async (p, iso) => { await p.evaluate(FAKE_NOW(iso)); await p.evaluate('renderPanel(false)'); };
const yearRead = p => p.evaluate(() => {
  const c = k => document.querySelectorAll('#week-list li.yr circle.' + k).length, fillOf = e => getComputedStyle(e).fill;
  const on = [...document.querySelectorAll('#week-list li.yr circle.on')].map(e => +e.getAttribute('fill-opacity'));
  const now = document.querySelector('#week-list li.yr circle.now');
  return { hd: document.getElementById('week-hd').textContent.trim(), on: c('on'), now: c('now'), off: c('off'),
           year: (document.querySelector('li.yr .yn') || {}).textContent, foot: (document.querySelector('li.yr .yt') || {}).textContent,
           first: on[0], last: on[on.length - 1], nowFill: now ? fillOf(now) : '', offOp: getComputedStyle(document.querySelector('li.yr circle.off') || document.body).fillOpacity,
           svgs: document.querySelectorAll('#week-list svg').length, kids: document.querySelectorAll('#week-list *').length };
});
for (const [name, iso, y, total, day, pct] of [
  ['23 Oct 2026', '2026-10-23T09:00:00Z', '٢٠٢٦', 365, 296, 81],
  ['1 Jan 2026', '2026-01-01T09:00:00Z', '٢٠٢٦', 365, 1, 0],
  ['31 Dec 2026', '2026-12-31T09:00:00Z', '٢٠٢٦', 365, 365, 100],
  ['29 Feb 2028 (leap year)', '2028-02-29T09:00:00Z', '٢٠٢٨', 366, 60, 16],
  ['31 Dec 2028 (leap year)', '2028-12-31T09:00:00Z', '٢٠٢٨', 366, 366, 100],
  ['Riyadh is already 1 Jan 2027 at 22:00 UTC', '2026-12-31T22:00:00Z', '٢٠٢٧', 365, 1, 0],
]) {
  const { p, ctx, errors } = await open('tv.html', 'panel=year');
  await yearAt(p, iso);
  const r = await yearRead(p), n = x => String(x).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  check(`year ${name}: header «السنة», year ${y}, ${total} dots`, !errors.length && r.hd === 'السنة' && r.year === y && r.on + r.now + r.off === total, JSON.stringify(r) + errors.join('; '));
  check(`year ${name}: ${day - 1} passed, today one, ${total - day} to come`, r.on === day - 1 && r.now === 1 && r.off === total - day, JSON.stringify(r));
  check(`year ${name}: «اليوم ${n(day)} من ${n(total)} · ${n(pct)}٪»`, r.foot === `اليوم ${n(day)} من ${n(total)} · ${n(pct)}٪`, r.foot);
  await ctx.close();
}
{   // looks: today the brightest gold, the passed days rise from dim, the days to come stay dim; one SVG, no animation loop
  const { p, ctx } = await open('tv.html', 'panel=year');
  await yearAt(p, '2026-10-23T09:00:00Z');
  const r = await yearRead(p);
  check('year: today is the brightest gold (#FFE9B8), the passed days rise from dim to full, the rest stay dim',
    r.nowFill === 'rgb(255, 233, 184)' && r.first < .4 && r.last > .95 && r.first < r.last && +r.offOp < .2, JSON.stringify(r));
  check('year: one SVG for the whole grid, under 1200 nodes', r.svgs === 1 && r.kids < 1200, JSON.stringify([r.svgs, r.kids]));
  check('year: the dots are drawn once a day, not on a timer (nothing re-renders while the minute passes)', await p.evaluate(async () => {
    const svg = document.querySelector('#week-list svg'); renderPanel(false); await new Promise(r => setTimeout(r, 200));
    return document.querySelector('#week-list svg') === svg; }));
  await ctx.close();
}
{   // the fill-in plays once, when the card first appears; not at all with reduced motion
  for (const reduce of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await ctx.route(/^https?:/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto(page('tv.html') + '#panel=year');
    await p.waitForFunction(() => document.querySelector('#week-list li.yr'), null, { timeout: 4000 });
    const a = await p.evaluate(() => getComputedStyle(document.querySelector('li.yr .r')).animationName);
    await p.evaluate('renderPanel(false)');
    const b = await p.evaluate(() => [document.querySelector('li.yr').className, getComputedStyle(document.querySelector('li.yr .r')).animationName]);
    check(`year: fill-in ${reduce ? 'skipped with reduced motion' : 'plays on the first draw only'}`,
      reduce ? a === 'none' && b[1] === 'none' : a === 'yrIn' && b[1] === 'none' && !b[0].includes('fill'), JSON.stringify([a, b]));
    await ctx.close();
  }
}
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const style of ['', 'current', 'dark1', 'glass1', 'dark3', 'glass3']) {
    const { p, ctx, errors } = await open('tv.html', 'panel=year' + (style ? '&cardstyle=' + style : ''), { width, height });
    await yearAt(p, '2028-12-31T09:00:00Z');   // the longest year, the last row full of lit dots
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const card = document.querySelector('.week'), c = card.getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect(),
            bar = document.querySelector('.bottom').getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect();
      const inside = [...card.querySelectorAll('li.yr > *')].every(e => { const b = e.getBoundingClientRect(); return b.left >= c.left && b.right <= c.right && b.bottom <= c.bottom; });
      const dot = card.querySelector('circle.off, circle.on').getBoundingClientRect();
      return { fit: c.top >= top.bottom && c.bottom <= bar.top - 4 && c.right <= clock.left - 4 && c.left >= 0 && c.height <= 0.5 * innerHeight,
               inside, dot: dot.width, h: c.height / innerHeight };
    });
    check(`year ${width}x${height} ${style || 'default'}: fits the card, clear of the clock and the bottom bar, dots readable`,
      !errors.length && r.fit && r.inside && r.dot >= 3, JSON.stringify(r) + errors.join('; '));
    await ctx.close();
  }
}
{   // digits and the launcher's card
  const { p, ctx, errors } = await open('tv.html', 'panel=year&digits=latin');
  await yearAt(p, '2026-10-23T09:00:00Z');
  const r = await yearRead(p), card = await p.evaluate(() => document.querySelector('.week').innerText);
  check('year digits=latin: 2026 and «اليوم 296 من 365 · 81%», no Eastern digits', !errors.length && r.year === '2026' && r.foot === 'اليوم 296 من 365 · 81%' && !/[٠-٩]/.test(card), r.year + ' ' + r.foot);
  await ctx.close();
}
{
  const { p, ctx, errors } = await open('tv.html', 'panel=year&widget=1', { width: 461, height: 250 });
  await yearAt(p, '2026-10-23T09:00:00Z');
  const r = await p.evaluate(() => { const c = document.querySelector('.week').getBoundingClientRect(), s = document.querySelector('.week svg').getBoundingClientRect();
    return { n: document.querySelectorAll('.week circle').length, w: c.width, h: c.height, dot: s.width / 380 * 6.4, ok: c.height <= innerHeight && s.right <= c.right }; });
  check('launcher card year: all dots there, fits 461x250', !errors.length && r.n >= 365 && r.ok, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- a whole league (#leagues=): a round of 9 games from the CI file, with TheSportsDB mocked. One request for the league's
// file, none per club; the followed club's own game is shown once; every game on one line, all paged through, on screen.
{
  const clubs = JSON.parse(readFileSync(path.join(ROOT, 'assets/shared/teams.json'), 'utf8'));
  const proLeague = clubs.filter(c => c.leagues.includes('Saudi-Arabian Pro League') && !c.leagues.includes('Saudi First Division League'));
  const longest = clubs.filter(c => c.sport === 'Soccer').sort((a, b) => b.ar.length - a.ar.length).slice(0, 4);
  const side = [...proLeague.slice(0, 14), ...longest];   // 18 sides: the 4 longest names make games 3 and 6 the worst case
  const at = h => new Date(Date.now() + h * 36e5).toISOString().slice(0, 19) + 'Z';
  // game 0 is the followed club's (Al-Hilal, 136013, kicks off in 3 h); 1 is under way; 2 finished 3 h ago; the rest to come
  const hrs = [3, -1, -3.2, 5, 9, 26, 28, 30, 50];
  const hilal = clubs.find(c => c.id === '136013');
  const rest = side.filter(c => c.id !== '136013');
  const ROUND = hrs.map((h, i) => {
    const home = i === 0 ? hilal : rest[2 * i - 1 < 0 ? 0 : (2 * i - 1) % rest.length], away = rest[(2 * i) % rest.length];
    return { idEvent: 'L' + i, idLeague: '4668', strSport: 'Soccer', strSeason: '2026-2027', idHomeTeam: home.id, strHomeTeam: home.en,
             idAwayTeam: away.id, strAwayTeam: away.en, strTimestamp: at(h),
             strStatus: i === 1 ? '1H' : i === 2 ? 'FT' : 'NS', intHomeScore: i === 1 ? '1' : i === 2 ? '2' : null,
             intAwayScore: i === 1 ? '0' : i === 2 ? '1' : null, strProgress: i === 1 ? '58' : null };
  });
  const FILE = { league: 'Saudi-Arabian Pro League', id: '4668', updated: new Date(Date.now() - 36e5).toISOString(), events: ROUND };
  const seen = [];
  const mock = r => {
    const u = new URL(r.request().url()), hdr = { 'Access-Control-Allow-Origin': '*' };
    seen.push(u.host + u.pathname + u.search);
    if (u.host === 'raw.githubusercontent.com' && u.pathname.endsWith('/data-leagues/leagues/saudi-arabian-pro-league.json'))
      return r.fulfill({ json: FILE, headers: hdr });
    if (!/thesportsdb/.test(u.host)) return r.abort();
    if (u.pathname.endsWith('eventsnext.php')) return r.fulfill({ json: { events: [ROUND[0]] }, headers: hdr });
    if (u.pathname.endsWith('lookupevent.php'))   // the game under way has moved on: 2 - 0
      return r.fulfill({ json: { events: [{ ...ROUND[1], intHomeScore: '2', intAwayScore: '0', strProgress: '61' }] }, headers: hdr });
    return r.fulfill({ json: { results: null }, headers: hdr });
  };
  for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.route(/^https?:/, mock);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    seen.length = 0;
    await p.goto(page('tv.html') + '#teams=136013&leagues=' + encodeURIComponent('Saudi-Arabian Pro League') + '&panel=matches');
    await p.waitForTimeout(1200);
    const tag = `league round at ${width}x${height}`;
    const asked = seen.filter(u => /thesportsdb|data-leagues/.test(u));
    check(`${tag}: one request for the league's file, two for the one followed club, nothing per club of the league`,
      asked.filter(u => /data-leagues/.test(u)).length === 1 && asked.filter(u => /eventsnext\.php|eventslast\.php/.test(u)).length === 2
      && !asked.some(u => /eventsnextleague|eventspastleague|eventsday|eventsseason|eventsround/.test(u)), asked.join('\n'));
    const r = await p.evaluate(() => {
      const row = document.getElementById('match-row'), blocks = [], bad = [];
      MATCH_PAGE = -1;
      for (let k = 0; k < 14; k++) {   // a pair too wide for one row is learnt on the way and shown apart: pages may grow to 8
        renderMatches(true);
        row.querySelectorAll('.mblock').forEach(b => {
          blocks.push(b.querySelector('.big').innerText.replace(/\s+/g, ' ').trim());
          const big = b.querySelector('.big > span');
          if (!fits(big)) bad.push('cut: ' + big.textContent);
          if (big.getClientRects().length !== 1 || big.scrollWidth > big.clientWidth + 1) bad.push('wraps: ' + big.textContent);
          const bb = b.getBoundingClientRect();
          if (bb.left < -2 || bb.right > innerWidth + 2 || bb.bottom > innerHeight + 2) bad.push('off screen: ' + big.textContent);
        });
      }
      const card = [], cut = [];
      const rows = matchRows().length;
      for (let k = 0; k * MATCH_ROWS < rows; k++) {   // every page of the card
        CARDS[0].page = k; renderPanel(false);
        document.querySelectorAll('#week-list li > span:first-child').forEach(sp => { card.push(sp.textContent.replace(/\s+/g, ' ').trim()); if (!fits(sp)) cut.push(sp.textContent); });
      }
      const turn = CONFIG.leagues.length && MATCH_PAGES > 3 ? CONFIG.matchPageFastMs : CONFIG.matchPageMs;
      return { blocks: [...new Set(blocks)], bad, pages: MATCH_PAGES, card: [...new Set(card)], cut, rows, turn, title: document.getElementById('week-hd').textContent };
    });
    check(`${tag}: no script errors`, !errors.length, errors.join('; '));
    check(`${tag}: all 9 games shown across ${r.pages} pages, the followed club's game once (a pair too wide for one row goes apart)`,
      r.blocks.length === 9 && r.pages >= 5 && r.pages <= 8, JSON.stringify(r.blocks));
    check(`${tag}: each game on one line, nothing cut with «…», nothing off screen`,
      !r.bad.length && !r.blocks.join('').includes('…'), r.bad.join(' | '));
    check(`${tag}: the live score is the file's until lookupevent answers; the finished game shows its score`,
      r.blocks.some(b => b.includes('١ - ٠')) && r.blocks.some(b => b.includes('٢ - ١')), r.blocks.join(' | '));
    check(`${tag}: the card lists the same 9 games, one line each, titled «المباريات»`,
      r.rows === 9 && r.card.length === 9 && !r.cut.length && r.title === 'المباريات', JSON.stringify({ rows: r.rows, cut: r.cut, t: r.title }));
    check(`${tag}: games in time order (result, live, then the followed club's, then the rest)`,
      r.card.length === 9 && r.card[0].includes('٢ - ١') && r.card[1].includes('١ - ٠') && r.card[2].startsWith('الهلال'), r.card.join(' | '));
    check(`${tag}: ${r.pages} pages turn every ${r.turn / 1000} s (the round passes in ${r.pages * r.turn / 1000} s, under a minute and a half)`,
      r.turn === 10000 && r.pages * r.turn <= 90000, r.turn);
    // a game under way is refreshed on its own: one lookup, the followed club's game (3 h away) is not asked
    seen.length = 0;
    await p.evaluate(() => loadLive());
    await p.waitForTimeout(400);
    const looked = seen.filter(u => /lookupevent/.test(u));
    const live = await p.evaluate(() => { MATCH_PAGE = -1; const out = [];
      for (let k = 0; k < MATCH_PAGES; k++){ renderMatches(true); document.querySelectorAll('#match-row .mblock .big').forEach(b => out.push(b.innerText)); }
      return out.join(' | '); });
    check(`${tag}: live: one lookup for the one game under way, its new score shown`,
      looked.length === 1 && /id=L1/.test(looked[0]) && live.includes('٢ - ٠'), looked.join(',') + ' / ' + live);
    await ctx.close();
  }
}

// ---- the two longest games of every league side by side: each fits its line (or the pair goes one to a page), at three sizes
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const clubs = JSON.parse(readFileSync(path.join(ROOT, 'assets/shared/teams.json'), 'utf8'));
  const { p, ctx, errors } = await open('tv.html', 'teams=&leagues=NBA', { width, height });
  const r = await p.evaluate(clubs => {
    const bad = [], names = [...new Set(clubs.flatMap(c => c.leagues))].filter(l => l !== 'National teams'), row = document.getElementById('match-row');
    for (const lg of names) {
      const byLen = clubs.filter(c => c.leagues.includes(lg)).sort((a, b) => b.ar.length - a.ar.length);
      const ev = (a, b, i) => ({ idEvent: lg + i, idHomeTeam: a.id, strHomeTeam: a.en, idAwayTeam: b.id, strAwayTeam: b.en,
                                 strTimestamp: new Date(Date.now() + 36e5 * (i + 2)).toISOString() });
      LEAGUE_DATA = { NBA: { updated: new Date(0).toISOString(), events: [ev(byLen[0], byLen[1], 0), ev(byLen[2], byLen[3], 1)] } };
      MATCHES_LOADED = true; MATCH_PAGE = -1;
      for (let k = 0; k < 4; k++) {
        renderMatches(true);
        row.querySelectorAll('.mblock .big > span').forEach(sp => { if (!fits(sp) || sp.textContent.includes('…')) bad.push(lg + ': ' + sp.textContent); });
      }
    }
    return { n: names.length, bad };
  }, clubs);
  check(`the longest names of all ${r.n} leagues, two games a page, at ${width}x${height}: every game whole on one line`,
    !errors.length && r.n >= 16 && !r.bad.length, r.bad.join(' | ') + errors.join('; '));
  await ctx.close();
}

// ---- the page turn of a league round: 10 s a page of two games once there are more than 3 pages (real timers, one run)
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#teams=&leagues=' + encodeURIComponent('Saudi-Arabian Pro League'));
  const r = await p.evaluate(() => {
    const t = h => new Date(Date.now() + h * 36e5).toISOString();
    LEAGUE_DATA['Saudi-Arabian Pro League'] = { updated: t(-1), events: Array.from({ length: 9 }, (_, i) => ({ idEvent: 'q' + i,
      idHomeTeam: '136013', strHomeTeam: 'Club ' + i, idAwayTeam: '136022', strAwayTeam: 'Team ' + i, strTimestamp: t(2 + i) })) };
    MATCHES_LOADED = true; renderMatches();
    return { pages: MATCH_PAGES, slot: SLOT_MATCHES };
  });
  const seenPages = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 26000) { seenPages.add(await p.evaluate(() => MATCH_PAGE)); await p.waitForTimeout(500); }
  check('league only (no club followed): the slot shows matches, 5 pages, turning by itself (3 turns in 26 s: 15 s, then 10 s)',
    r.slot && r.pages === 5 && seenPages.size >= 3, JSON.stringify({ ...r, seen: [...seenPages] }));
  await ctx.close();
}

// ---- no league followed: nothing changes (no request for a league's file, the old title)
{
  const seen = [];
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => { seen.push(r.request().url()); return r.abort(); });
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#teams=136013&panel=matches');
  await p.waitForTimeout(800);
  const t = await p.evaluate(() => ({ leagues: CONFIG.leagues, hd: document.getElementById('week-hd').textContent }));
  check('no league followed: #leagues empty, no league file asked for, the card keeps «مباريات فرقك»',
    !t.leagues.length && !seen.some(u => /data-leagues/.test(u)) && t.hd === 'مباريات فرقك', JSON.stringify(t) + seen.join(','));
  await ctx.close();
}

// ---- «صوري»: the owner's own photos (#own=N&ownmode=mix|only). The app answers https://own.urtv.invalid/N.jpg from its own folder;
// here a generated picture stands in. Rotated hour by hour with 60-minute slots (the Riyadh clock is stubbed).
{
  const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAJABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKKzPJP/9k=', 'base64');
  const OWN = 'https://own.urtv.invalid/';
  const rotate = async (hash, { failOwn = false } = {}) => {
    const asked = [];
    const net = r => {
      const u = r.request().url();
      asked.push(u);
      if (!u.startsWith(OWN)) return false;
      if (failOwn) { r.abort(); return true; }
      r.fulfill({ contentType: 'image/jpeg', body: JPEG });
      return true;
    };
    const o = await open('tv.html', hash + '&photos=60', { net });
    const seen = new Set();
    let credit = '';
    for (let h = 0; h < 24; h++) {
      await o.p.evaluate(h => { const orig = window.__rp || (window.__rp = riyadhParts); riyadhParts = d => ({ ...orig(d), h, mi: 0 }); applyBackground(true); }, h);
      await o.p.waitForTimeout(60);
      const [bg, cr] = await o.p.evaluate(() => [document.querySelector('.photo').style.backgroundImage, document.getElementById('credit').textContent]);
      seen.add(bg.replace(/^url\("?|"?\)$/g, ''));
      if (bg.includes('own.urtv.invalid')) credit += cr;
    }
    await o.ctx.close();
    return { seen: [...seen], asked, credit, errors: o.errors };
  };
  const ownSeen = r => r.seen.filter(u => u.startsWith(OWN));
  const hosted = r => r.seen.filter(u => u.includes('/photos/'));
  const bundled = r => r.seen.filter(u => u.includes('/assets/backgrounds/') || u.startsWith('data:'));

  let r = await rotate('own=3&ownmode=only');
  check('own photos, only: every photo of the owner shows, and nothing of ours', ownSeen(r).length === 3 && r.seen.length === 3
    && ownSeen(r).every(u => /\/[123]\.jpg$/.test(u)), r.seen.join(' '));
  check('own photos, only: no network for our photos (no index, no hosted, no bundled)',
    !r.asked.some(u => u.includes('/photos/') || u.includes('/assets/backgrounds/')), r.asked.filter(u => !u.startsWith(OWN)).join(' '));
  check('own photos: no credit line', r.credit === '' && !r.errors.length, r.credit + r.errors.join(';'));

  r = await rotate('own=2&ownmode=mix');
  check('own photos, mix: theirs join ours in the rotation', ownSeen(r).length === 2 && hosted(r).length > 0, r.seen.join(' '));

  r = await rotate('own=2');
  check('own photos: mix is the default mode', ownSeen(r).length === 2 && hosted(r).length > 0, r.seen.join(' '));

  r = await rotate('city=جدة');
  check('no own photos: nothing changes (ours only, no own request)', ownSeen(r).length === 0 && hosted(r).length > 0
    && !r.asked.some(u => u.startsWith(OWN)), r.seen.join(' '));

  r = await rotate('own=0&ownmode=only');
  check('no own photos, only: ours (only needs a photo to apply)', ownSeen(r).length === 0 && hosted(r).length > 0, r.seen.join(' '));

  r = await rotate('own=99&ownmode=only');
  check('own photos: at most 10', ownSeen(r).length <= 10 && ownSeen(r).every(u => /\/(10|[1-9])\.jpg$/.test(u)), r.seen.join(' '));

  r = await rotate('own=2&ownmode=only', { failOwn: true });
  check('own photos, only, unreadable: a bundled photo shows, never an empty screen', r.seen.every(u => u !== '' && u !== 'none') && bundled(r).length > 0, r.seen.join(' '));

  // no hosted index yet (first start, offline): theirs join the bundled photos
  {
    const o = await open('tv.html', 'own=1&ownmode=mix&photos=60', { seed: false, net: r2 => { if (r2.request().url().startsWith(OWN)) { r2.fulfill({ contentType: 'image/jpeg', body: JPEG }); return true; } return false; } });
    const seen = new Set();
    for (let h = 0; h < 24; h++) {
      await o.p.evaluate(h => { const orig = window.__rp || (window.__rp = riyadhParts); riyadhParts = d => ({ ...orig(d), h, mi: 0 }); applyBackground(true); }, h);
      await o.p.waitForTimeout(60);
      seen.add(await o.p.evaluate(() => document.querySelector('.photo').style.backgroundImage));
    }
    const all = [...seen].join(' ');
    check('own photos, mix, no hosted set yet: theirs join the bundled photos', all.includes('own.urtv.invalid/1.jpg') && seen.size > 1, all.slice(0, 300));
    await o.ctx.close();
  }
}

// ---- up to three cards on the home screen: one WebView, the box grows with the number of cards (HomeCard / MainActivity.homeCardBox).
// One card is the size it always was (461 x 250); two or three share a box 58% of the screen wide (1122 px at 1920: 560 + 22 + 540),
// as tall as 250 dp of 540 (a third card has 253 or, when a long app title is in the way, 193).
const homeBox = (cards, W, tight = false) => cards <= 1 ? [461, 250] : [Math.round(W * 0.5844), Math.round(W * 9 / 16 * (tight ? 0.346 : 0.463))];
// what the cards need, put in by hand: the app asks the network for these (here cut)
const HOME_SEED = ({ isha = '19:15' } = {}) => `
  buildPrayers({ Fajr: '04:50', Sunrise: '06:05', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:45', Isha: '${isha}' });
  FORECAST = [0, 1, 2, 3, 4].map(i => ({ date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), code: 2, hi: 37 - i, lo: 24 - i }));
  HOURLY = [1, 2, 3, 4, 5, 6].map(i => ({ t: '2026-10-22T' + String(i + 16).padStart(2, '0') + ':00', code: [0, 2, 3, 61, 3, 0][i - 1], temp: 34 - i }));
  STOCKS = { '2222': { p: 28.5, v: 28, c: [1, 2, 3, 2, 4] }, '1120': { p: 90, v: 91, c: [3, 2, 1, 2] }, AAPL: { p: 230, v: 229, c: [1, 2, 3] } };
`;
const HOME_NOW = new Date('2026-10-22T13:40:00Z');   // Thursday 16:40 in Riyadh: the evening adhkar window
const TASKS12 = ['اتصل بالسباك', 'شراء حليب وخبز', 'موعد الأسنان الثلاثاء', 'تجديد الإقامة', 'سداد فاتورة الكهرباء', 'غسيل السيارة', 'حجز الفندق', 'الاتصال بالجد'];
const HOME_COMBOS = [   // [name, cards, extra hash, games to put in (when it has the matches card)]
  ['matches + prayer row + hours', 'matches,prayerrow,hourly', 'teams=136013', LONG_GAMES],
  ['matches (short names) + prayer row + hours', 'matches,prayerrow,hourly', 'teams=136013', SHORT_GAMES],
  ['verse + stocks', 'verse,stocks', 'stocks=2222,1120,AAPL', null],
  ['adhkar alone', 'adhkar', '', null],
  ['tasks + forecast', 'tasks,forecast', 'tasks=' + encodeURIComponent(TASKS12.join('\n')), null],
];
const homeCards = async (cards, W, { style = 'current', tight = false, extra = '', games = null, digits = 'hindi', isha = '19:15', width, height } = {}) => {
  const n = cards.split(',').length, [bw, bh] = homeBox(n, W, tight), seen = [];
  const o = await open('tv.html', `home_panel=${cards}&widget=1&cardstyle=${style}&digits=${digits}&${extra}`,
    { width: width || bw, height: height || bh, now: HOME_NOW, net: crestNet(seen) });
  await o.p.evaluate(HOME_SEED({ isha }) + (games ? CREST_GAMES(games) : '') + ' renderPanel(false);');
  if (games) { await o.p.evaluate(() => { for (let k = 0; k < 6; k++) { for (const c of CARDS) if (c.eff === 'matches') { c.ul.__h = null; } } renderPanel(false, 'matches'); }); }
  await o.p.waitForTimeout(150);
  return { ...o, n, bw: width || bw, bh: height || bh };
};
// everything the eye would object to: overlapping cards, text cut off or ending in «…», anything past the box
const homeProbe = p => p.evaluate(() => {
  const rect = c => { const b = c.el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const rs = CARDS.map(rect), overlap = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
    if (rs[i].l < rs[j].r - .5 && rs[j].l < rs[i].r - .5 && rs[i].t < rs[j].b - .5 && rs[j].t < rs[i].b - .5) overlap.push([i, j]);
  const outside = rs.map((r, i) => r.l < -.5 || r.r > innerWidth + .5 || r.b > innerHeight + .5 || r.t < -.5 ? i : -1).filter(i => i >= 0);
  const cut = CARDS.filter(c => [...c.el.querySelectorAll('li, li *, .hd > span')].some(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)).map(c => c.eff);
  const dots = CARDS.filter(c => c.el.innerText.includes('…')).map(c => c.eff);
  const tooSmall = CARDS.filter(c => [...c.el.querySelectorAll('li, li *')].some(e => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 7.5)).map(c => c.eff);
  const text = CARDS.map(c => c.el.innerText).join(' ');
  return { n: CARDS.length, kinds: CARDS.map(c => c.eff), overlap, outside, cut, dots, tooSmall, latin: (text.match(/[0-9]+/g) || []), arabic: /[٠-٩]/.test(text),
    z: CARDS.map(c => c.z), empty: CARDS.filter(c => c.ul.querySelector('li.empty')).map(c => c.eff), heights: rs.map(r => Math.round(r.b - r.t)), mid: Math.round(document.querySelector('.mid').getBoundingClientRect().height) };
});
for (const style of ['glass1', 'dark3']) {
  for (const W of [1920, 1280, 960]) {
    for (const [name, cards, extra, games] of HOME_COMBOS) {
      const o = await homeCards(cards, W, { style, extra, games }), r = await homeProbe(o.p);
      const tag = `home cards ${name}, ${style}, screen ${W}`;
      check(`${tag}: ${o.n} card${o.n > 1 ? 's' : ''} in a ${o.bw}x${o.bh} box, no script errors, none empty`,
        !o.errors.length && r.n === o.n && r.kinds.join() === cards && !r.empty.length, JSON.stringify(r) + o.errors.join('; '));
      check(`${tag}: no overlap, inside the box, no «…», nothing cut off`, !r.overlap.length && !r.outside.length && !r.dots.length && !r.cut.length && r.mid <= o.bh + 1,
        JSON.stringify(r));
      check(`${tag}: Arabic digits only, none of them under 7.5 px`, !r.latin.length && r.arabic && !r.tooSmall.length, JSON.stringify(r));
      await o.ctx.close();
    }
  }
}

// the third card has less room when a long app title is in the way (193 dp of 540): the cards step down and still fit
for (const style of ['current', 'glass1', 'dark3']) {
  for (const W of [1920, 1280, 960]) {
    const [name, cards, extra, games] = HOME_COMBOS[0];
    const o = await homeCards(cards, W, { style, extra, games, tight: true }), r = await homeProbe(o.p);
    check(`home cards ${name}, ${style}, screen ${W}, a short box (${o.bh}): no overlap, inside it, no «…», nothing cut off, no script errors`,
      !o.errors.length && !r.overlap.length && !r.outside.length && !r.dots.length && !r.cut.length && r.mid <= o.bh + 1 && !r.empty.length, JSON.stringify(r) + o.errors.join('; '));
    await o.ctx.close();
  }
}
// the narrow prayer row (a card of a pair is about half the box): «العشاء ٦:٥١ م» still fits its cell, on one line, at every size
for (const [style, W] of [['current', 960], ['glass1', 1280], ['dark3', 960], ['current', 1920]]) {
  const o = await homeCards('matches,prayerrow,hourly', W, { style, extra: 'teams=136013', games: SHORT_GAMES, isha: '18:51' });
  const r = await o.p.evaluate(() => { const card = CARDS[1].el.getBoundingClientRect(), cells = [...CARDS[1].ul.querySelectorAll('.pc')], last = cells[cells.length - 1];
    const b = last.querySelector('b'), i = last.querySelector('i'), cell = last.getBoundingClientRect();
    return { name: b.textContent, time: i.textContent, one: [b, i].every(x => x.getClientRects().length === 1), inCell: [b, i].every(x => x.scrollWidth <= last.clientWidth + 1),
      inCard: cell.left >= card.left - 1 && cell.right <= card.right + 1, z: CARDS[1].z, size: parseFloat(getComputedStyle(i).fontSize) }; });
  check(`home prayer row, ${style}, screen ${W}: «العشاء ٦:٥١ م» on one line inside its cell and the card (text size ${r.size.toFixed(1)} px)`,
    !o.errors.length && r.name === 'العشاء' && r.time === '٦:٥١ م' && r.one && r.inCell && r.inCard, JSON.stringify(r) + o.errors.join('; '));
  await o.ctx.close();
}
// the list in the link: one value works, none or empty is no card, a card once, no more than three, the unknown left out
for (const [list, want, mid] of [['verse', 'verse', 'n1'], ['prayers,hourly', 'prayers,hourly', 'n2'], ['verse,stocks,year,tasks', 'verse,stocks,year', 'n3'],
    ['year,year,prayers', 'year,prayers', 'n2'], ['bogus,wisdom', 'wisdom', 'n1'], ['none', '', ''], ['', '', ''], ['none,verse', 'verse', 'n1']]) {
  const o = await open('tv.html', `home_panel=${list}&widget=1`, { width: 561, height: 250 });
  const r = await o.p.evaluate(() => ({ kinds: CARDS.map(c => c.kind).join(), cfg: CONFIG.cards.join(), mid: document.querySelector('.mid').className,
    ids: [...document.querySelectorAll('[id=week-list]')].length, shown: [...document.querySelectorAll('.week')].filter(e => getComputedStyle(e).display !== 'none').length }));
  check(`home_panel=${list || '(empty)'} → ${want || 'no card'}`, !o.errors.length && r.kinds === want && r.cfg === want && (mid ? r.mid.includes(mid) : r.shown === 0) && r.ids <= 1,
    JSON.stringify(r) + o.errors.join('; '));
  await o.ctx.close();
}
{   // an older launcher sends the one card as panel=; the screensaver never reads home_panel
  const o = await open('tv.html', 'panel=wisdom&widget=1', { width: 461, height: 250 }), r = await o.p.evaluate(() => CARDS.map(c => c.kind).join());
  check('an older launcher\'s #panel= still gives its one card', !o.errors.length && r === 'wisdom', r);
  await o.ctx.close();
  const q = await open('tv.html', 'panel=year&home_panel=verse,stocks'), r2 = await q.p.evaluate(() => CARDS.map(c => c.kind).join());
  check('the screensaver ignores home_panel: its own card, one', !q.errors.length && r2 === 'year', r2);
  await q.ctx.close();
}
{   // the layout follows the count: one card the box's width; two side by side (the first on the right); the third under them, full width
  for (const [cards, cols] of [['verse', 1], ['verse,stocks', 2], ['verse,stocks,year', 2]]) {
    const o = await homeCards(cards, 1920, { extra: 'stocks=2222,1120,AAPL' }), r = await o.p.evaluate(() => CARDS.map(c => { const b = c.el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)]; }));
    const n = r.length, [w] = homeBox(n, 1920);
    let ok = n === cards.split(',').length;
    if (n === 1) ok = ok && r[0][0] === 0 && r[0][1] === 461;
    if (n >= 2) ok = ok && r[0][1] === w && r[1][0] === 0 && r[0][0] - r[1][1] === 22 && Math.abs((r[0][1] - r[0][0]) - 560) <= 2 && Math.abs((r[1][1] - r[1][0]) - 540) <= 2 && r[0][2] === r[1][2];
    if (n === 3) ok = ok && r[2][0] === 0 && r[2][1] === w && r[2][2] >= Math.max(r[0][3], r[1][3]) + 21;
    check(`home cards ${cards}: ${n} card${n > 1 ? 's' : ''} laid out ${n === 1 ? 'alone' : n === 2 ? '560 + 22 + 540 side by side, the first on the right' : 'in a pair with the third under it, full width'}`, !o.errors.length && ok, JSON.stringify(r));
    await o.ctx.close();
  }
}
{   // one card is not changed by the sizing: full size, no steps, whatever the box
  for (const kind of ['matches', 'verse', 'adhkar', 'tasks', 'prayerrow', 'hourly']) {
    const o = await homeCards(kind, 1920, { extra: 'teams=136013&tasks=' + encodeURIComponent(TASKS12.join('\n')), games: kind === 'matches' ? LONG_GAMES : null });
    const r = await o.p.evaluate(() => CARDS.map(c => [c.z, c.cap, c.maxLen]));
    check(`home card ${kind} alone: never stepped down`, !o.errors.length && JSON.stringify(r) === '[[1,0,0]]', JSON.stringify(r));
    await o.ctx.close();
  }
}
{   // each card keeps its own page: the tasks card turns pages, the stocks card beside it stays on its one
  const o = await homeCards('tasks,stocks', 960, { extra: 'stocks=2222,1120,AAPL&tasks=' + encodeURIComponent(TASKS12.join('\n')) });
  const r = await o.p.evaluate(() => { const first = () => CARDS[0].ul.textContent, a = first(), st = CARDS[1].ul.textContent;
    CARDS[0].page++; renderCard(CARDS[0], false); fitCards(); return { moved: first() !== a, same: CARDS[1].ul.textContent === st, pages: CARDS.map(c => c.page) }; });
  check('home cards: a page turn of one card does not touch the other', !o.errors.length && r.moved && r.same && r.pages.join() === '1,0', JSON.stringify(r));
  await o.ctx.close();
}
{   // the saved copy is per card, and each card takes back only what its own kind drew
  const ctx = await browser.newContext({ viewport: { width: 561, height: 250 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#home_panel=shows,tasks&widget=1');
  await p.waitForTimeout(800);
  await p.evaluate(() => { CARDS[0].ul.innerHTML = '<li>SAVED A</li>'; CARDS[1].ul.innerHTML = '<li>SAVED B</li>'; saveSnap(); });
  await p.goto(page('tv.html') + '#home_panel=shows,tasks&widget=1'); await restart(p);
  const same = await p.evaluate(() => CARDS.map(c => c.ul.textContent).join('|'));
  await p.goto(page('tv.html') + '#home_panel=tasks,shows&widget=1'); await restart(p);
  const swapped = await p.evaluate(() => CARDS.map(c => c.ul.textContent).join('|'));
  check('home cards: the last drawn cards come back at once, each its own', same === 'SAVED A|لا مهام اليوم' || same === 'SAVED A|SAVED B', same);
  check('home cards: a card in another place does not take another kind\'s saved copy', !swapped.includes('SAVED'), swapped);
  await ctx.close();
}

// ---- «البطاقة الذكية» (smart): what matters now, by four rules in this order, checked on every redraw. The time is held with the
// Date.now override; Thursday 2026-10-22, Riyadh +3: Fajr 4:50, Dhuhr 11:40, Asr 15:00, Maghrib 17:45, Isha 19:15.
const SMART_PRAYERS = "buildPrayers({ Fajr: '04:50', Sunrise: '06:05', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:45', Isha: '19:15' });";
const smartAt = async (p, hhmm, { game = null, status = null, score = true } = {}) => p.evaluate(([hhmm, game, status, score, prayers, sample]) => {
  const R = window.__R || (window.__R = Date), T = Date.parse('2026-10-22T' + hhmm + ':00+03:00');
  window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
  ADHKAR.length = 0; ADHKAR.push(...sample);
  eval(prayers);
  HOURLY = [1, 2, 3, 4, 5, 6].map(i => ({ t: '2026-10-22T' + String(i + 12).padStart(2, '0') + ':00', code: 2, temp: 33 - i }));
  MATCHES = {}; NEXT_LIST = {};
  if (game !== null) {   // kick-off `game` minutes from now (negative: already under way)
    const ev = { idEvent: 'g1', strHomeTeam: 'Al-Hilal', strAwayTeam: 'Al-Nassr', idHomeTeam: '100', idAwayTeam: '101', strSport: 'Soccer',
      strTimestamp: new Date(T + game * 60000).toISOString(), strStatus: status || (game < 0 ? '2H' : 'NS'), strProgress: '34',
      intHomeScore: score && game < 0 ? 2 : null, intAwayScore: score && game < 0 ? 1 : null };
    MATCHES['136013'] = ev; NEXT_LIST['136013'] = [ev];
  }
  MATCHES_LOADED = true;
  for (const c of CARDS) { clearTimeout(c.ad.t); c.ad.t = 0; c.ad.i = 0; c.ad.mode = ''; }
  renderPanel(false);
  const c = CARDS[0];
  return { eff: c.eff, hd: c.hd.textContent.replace(/\s+/g, ' ').trim(), text: c.ul.textContent.replace(/\s+/g, ' ').trim(), rows: c.ul.children.length,
           timer: c.ad.t !== 0 };
}, [hhmm, game, status, score, SMART_PRAYERS, ADHKAR_SAMPLE]);
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=smart', { width, height });
  const tag = `smart card ${width}x${height}`;
  const r = {
    live: await smartAt(p, '10:00', { game: -20 }),                 // a followed team is playing: the game, over the adhkar window
    in59: await smartAt(p, '13:00', { game: 59 }),
    in61: await smartAt(p, '13:00', { game: 61 }),
    over: await smartAt(p, '13:00', { game: -30, status: 'FT' }),   // finished: not live any more
    soonOverAdhkar: await smartAt(p, '16:00', { game: 30 }),
    morning: await smartAt(p, '06:00'), evening: await smartAt(p, '16:00'), beforeMaghrib: await smartAt(p, '17:44'),
    night: await smartAt(p, '22:00'),
    p15: await smartAt(p, '19:00'), p16: await smartAt(p, '18:59'), atAdhan: await smartAt(p, '19:15'), fajr15: await smartAt(p, '04:35'),
    dhuhr10: await smartAt(p, '11:30'),
    plain: await smartAt(p, '13:00'),
  };
  check(`${tag}: no script errors`, !errors.length, errors.join('; '));
  check(`${tag}: a followed team's game, live or within 60 minutes: the matches card with that game`,
    [r.live, r.in59, r.soonOverAdhkar].every(x => x.eff === 'matches' && x.rows === 1 && /الهلال/.test(x.text) && /النصر/.test(x.text))
    && /٢ - ١/.test(r.live.text) && r.in61.eff !== 'matches' && r.over.eff !== 'matches', JSON.stringify({ live: r.live, in59: r.in59, in61: r.in61.eff, over: r.over.eff, soon: r.soonOverAdhkar }));
  check(`${tag}: the adhkar window (morning from Fajr, evening until Maghrib): the adhkar card; at night and after the window it is not`,
    r.morning.eff === 'adhkar' && /الصباح/.test(r.morning.hd) && r.evening.eff === 'adhkar' && /المساء/.test(r.evening.hd)
    && r.night.eff !== 'adhkar' && r.plain.eff !== 'adhkar', JSON.stringify({ m: r.morning.eff, e: r.evening.eff, n: r.night.eff }));
  check(`${tag}: 15 minutes before a prayer: the prayer row, «العشاء بعد ١٥ د»; 16 minutes before, and at the adhan itself, it is not`,
    r.p15.eff === 'prayerrow' && r.p15.hd === 'العشاء بعد ١٥ د' && r.fajr15.eff === 'prayerrow' && r.p16.eff === 'hourly' && r.atAdhan.eff === 'hourly',
    JSON.stringify({ p15: r.p15.hd, f: r.fajr15.eff, p16: r.p16.eff, at: r.atAdhan.eff }));
  check(`${tag}: otherwise the next hours' weather`, r.plain.eff === 'hourly' && r.plain.hd === 'الساعات القادمة' && r.plain.rows === 1 && r.night.eff === 'hourly',
    JSON.stringify(r.plain));
  check(`${tag}: the last 15 minutes before Dhuhr and Maghrib, inside the adhkar window, the prayer wins (rule 2 comes before rule 3)`,
    r.dhuhr10.eff === 'prayerrow' && r.dhuhr10.hd === 'الظهر بعد ١٠ د' && r.beforeMaghrib.eff === 'prayerrow', JSON.stringify([r.dhuhr10, r.beforeMaghrib.eff]));
  // the card follows the minute: it changes by itself as the time passes, the adhkar timer stops when it leaves
  const flow = await p.evaluate(() => {
    const R = window.__R, mk = hh => { const T = Date.parse('2026-10-22T' + hh + ':00+03:00'); window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } }; };
    MATCHES = {}; NEXT_LIST = {}; const out = [];
    mk('16:00'); renderPanel(false, 'prayers'); out.push([CARDS[0].eff, CARDS[0].ad.t !== 0]);
    mk('18:00'); renderPanel(false, 'prayers'); out.push([CARDS[0].eff, CARDS[0].ad.t !== 0]);
    return out;
  });
  check(`${tag}: it changes with the time, and the adhkar timer stops when the card leaves them`, JSON.stringify(flow) === '[["adhkar",true],["hourly",false]]', JSON.stringify(flow));
  await ctx.close();
}
{   // in a home slot, beside the others; Latin digits too
  for (const [digits, want] of [['hindi', 'العشاء بعد ١٥ د'], ['latin', 'العشاء بعد 15 د']]) {
    const o = await open('tv.html', `home_panel=smart,verse&widget=1&digits=${digits}`, { width: 561, height: 250 });
    const r = await smartAt(o.p, '19:00');
    check(`smart card in a home slot (${digits}): the prayer row and its title, the second card beside it; no script errors`, !o.errors.length && r.eff === 'prayerrow' && r.hd === want
      && await o.p.evaluate(() => CARDS.length === 2 && CARDS[1].kind === 'verse'), JSON.stringify(r) + o.errors.join('; '));
    await o.ctx.close();
  }
}
{   // no request of its own: the same ones its four cards would make, the hours in the forecast's single request
  const asked = [];
  const o = await open('tv.html', 'teams=136013&home_panel=smart&widget=1', { width: 461, height: 250, net: r => { asked.push(r.request().url()); return false; } });
  await o.p.waitForTimeout(300);
  const hosts = [...new Set(asked.map(u => new URL(u).host))].sort();
  const forecast = asked.filter(u => /api\.open-meteo\.com\/v1\/forecast/.test(u));
  check('smart card: only the requests of the cards it shows (prayers, matches, the forecast with its hours), one forecast request',
    hosts.every(h => ['api.aladhan.com', 'www.thesportsdb.com', 'api.open-meteo.com', 'raw.githubusercontent.com', 'api.coingecko.com', 'query1.finance.yahoo.com'].includes(h) || /thesportsdb\.com$/.test(h))
    && forecast.length === 1 && /hourly=/.test(forecast[0]) && !asked.some(u => /air-quality|tvmaze|wikidata/.test(u)), asked.join(' '));
  await o.ctx.close();
}

// ---- the live game grows: a followed team under way shows alone, big: score, minute, «مباشر», both crests where there are crests
// (the launcher's card), names on one line; when it ends the card goes back to the list. The bottom slot does the same.
const LIVE_EV = (over = {}) => ({ idEvent: 'L1', strHomeTeam: 'Manchester United', strAwayTeam: 'Borussia Monchengladbach', idHomeTeam: '100', idAwayTeam: '101', strSport: 'Soccer',
  strTimestamp: new Date(Date.now() - 67 * 60000).toISOString(), strStatus: '2H', strProgress: '67', intHomeScore: 2, intAwayScore: 1,
  strHomeTeamBadge: BADGE(100), strAwayTeamBadge: BADGE(101), ...over });
const LATER_EV = { idEvent: 'L2', strHomeTeam: 'Al-Ahli', strAwayTeam: 'Al-Ittihad', idHomeTeam: '102', idAwayTeam: '103', strSport: 'Soccer', strTimestamp: new Date(Date.now() + 30 * 3600000).toISOString() };
for (const [width, height, label] of [[461, 250, 'launcher card'], [1920, 1080, 'launcher card at 1920'], [960, 540, 'launcher card at 960']]) {
  for (const digits of ['hindi', 'latin']) {
    const seen = [];
    const { p, ctx, errors } = await open('tv.html', `teams=136013&panel=matches&widget=1&digits=${digits}`, { width, height, net: crestNet(seen) });
    const setup = ev2 => p.evaluate(([a, b]) => { NEXT_LIST = { '136013': [a, b] }; MATCHES = { '136013': a }; MATCHES_LOADED = true; loadCrests(); renderPanel(false, 'matches'); }, [LIVE_EV(ev2), LATER_EV]);
    await setup({});
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => { const li = [...document.querySelectorAll('#week-list li')], big = document.querySelector('#week-list li.lv'), t = big && big.querySelector('.lvt');
      return { n: li.length, big: !!big, text: big ? big.textContent.replace(/\s+/g, ' ').trim() : '', crests: big ? [...big.querySelectorAll('img.cr')].filter(i => i.src.startsWith('data:image/png')).length : 0,
        oneLine: t ? t.scrollWidth <= t.clientWidth + .5 && [...t.querySelectorAll('.tm')].every(x => x.getClientRects().length === 1) : false,
        score: big ? big.querySelector('.sc').getBoundingClientRect().height : 0, norm: parseFloat(getComputedStyle(document.querySelector('#week-list li.lv .tm')).fontSize),
        base: parseFloat(getComputedStyle(document.querySelector('.week')).fontSize), dots: document.getElementById('week-list').textContent.includes('…') }; });
    const tag = `live game big, ${label} ${width}x${height} ${digits}`;
    check(`${tag}: only that game, big: «مباشر», the minute and the score; no script errors`, !errors.length && r.n === 1 && r.big && /مباشر/.test(r.text) && /الدقيقة|Minute|67|٦٧/.test(r.text)
      && (digits === 'latin' ? /2 - 1/.test(r.text) : /٢ - ١/.test(r.text)) && !r.dots, JSON.stringify(r) + errors.join('; '));
    check(`${tag}: both crests, the names on one line (the long ones shortened if they must be)`, r.crests === 2 && r.oneLine, JSON.stringify(r));
    // the game ends: the list is back, with its result
    await p.evaluate(() => { MATCHES['136013'] = Object.assign({}, MATCHES['136013'], { strStatus: 'FT', strTimestamp: new Date(Date.now() - 3 * 3600000).toISOString() }); NEXT_LIST['136013'][0] = MATCHES['136013']; renderPanel(false, 'matches'); });
    const back = await p.evaluate(() => ({ lv: !!document.querySelector('#week-list li.lv'), n: document.querySelectorAll('#week-list li').length }));
    check(`${tag}: when it ends the card goes back to the list`, !back.lv && back.n >= 1, JSON.stringify(back));
    await ctx.close();
  }
}
{   // the shortened pair: both teams with long names, in a narrow slot
  const { p, ctx, errors } = await open('tv.html', 'teams=136013&panel=matches&widget=1', { width: 300, height: 200 });
  await p.evaluate(ev => { NEXT_LIST = { '136013': [ev] }; MATCHES = { '136013': ev }; MATCHES_LOADED = true; renderPanel(false, 'matches'); }, LIVE_EV({ strHomeTeam: 'Borussia Monchengladbach', strAwayTeam: 'Eintracht Frankfurt' }));
  const r = await p.evaluate(() => { const t = document.querySelector('#week-list .lvt'); return { ok: t.scrollWidth <= t.clientWidth + .5, text: t.textContent, k: t.style.getPropertyValue('--k') }; });
  check('live game big: two long names in a narrow card still on one line, no «…»', !errors.length && r.ok && !r.text.includes('…'), JSON.stringify(r));
  await ctx.close();
}
// the bottom slot: the same game, big, alone, with its minute
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  const { p, ctx, errors } = await open('urtv.html', 'teams=136013', { width, height });
  const r = await p.evaluate(ev => {
    NEXT_LIST = { '136013': [ev] }; MATCHES = { '136013': ev }; MATCHES_LOADED = true; renderMatches();
    const row = document.getElementById('match-row'), b = row.querySelector('.mblock'), sp = b.querySelector('.big > span');
    const before = parseFloat(getComputedStyle(b.querySelector('.big')).fontSize);
    return { n: row.querySelectorAll('.mblock').length, big: b.classList.contains('lvb'), text: row.textContent.replace(/\s+/g, ' ').trim(), fit: sp.scrollWidth <= sp.clientWidth + .5, size: before,
             oneLine: [...sp.querySelectorAll('.tm')].every(x => x.getClientRects().length === 1) };
  }, LIVE_EV({ strHomeTeam: 'Al-Hilal', strAwayTeam: 'Al-Nassr' }));
  const plain = await p.evaluate(ev => { NEXT_LIST = { '136013': [ev] }; MATCHES = { '136013': ev }; renderMatches(); return parseFloat(getComputedStyle(document.querySelector('#match-row .mblock .big')).fontSize); },
    { ...LATER_EV, idEvent: 'L9' });
  check(`bottom slot ${width}x${height}: the live game alone and big (larger than a game to come), score, minute, «مباشر», one line`,
    !errors.length && r.n === 1 && r.big && /مباشر/.test(r.text) && /الدقيقة ٦٧/.test(r.text) && /٢ - ١/.test(r.text) && r.fit && r.oneLine && r.size > plain, JSON.stringify({ ...r, plain }) + errors.join('; '));
  await ctx.close();
}

// ---- the bar before the adhan: «الأذان بعد ٨ دقائق» in the last 10 minutes before each prayer, «الإقامة بعد ١٢ دقيقة» from the adhan
// to the iqama (Fajr 25, Maghrib 10, the rest 20; none for a Friday's Dhuhr); #adhanbar=0 turns it off. Times held with Date.now.
const ADHAN_TIMES = "buildPrayers({ Fajr: '04:50', Sunrise: '06:05', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:45', Isha: '19:15' });";
const barAt = (p, day, hhmm, ss = '00') => p.evaluate(([iso, times]) => {
  const R = window.__R || (window.__R = Date), T = Date.parse(iso);
  window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(T); } static now() { return T; } };
  eval(times); tickPrayer();
  const b = document.getElementById('adbar'), cs = getComputedStyle(b), r = b.getBoundingClientRect();
  return { hidden: b.hidden || cs.display === 'none', text: b.textContent, top: r.top, h: r.height, w: r.width };
}, [`${day}T${hhmm}:${ss}+03:00`, ADHAN_TIMES]);
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const digits of ['hindi', 'latin']) {
    const { p, ctx, errors } = await open('tv.html', `panel=prayers&digits=${digits}`, { width, height });
    const N = s => digits === 'latin' ? s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : s;
    const THU = '2026-10-22', FRI = '2026-10-23';
    const r = { m10: await barAt(p, THU, '17:35'), m10b: await barAt(p, THU, '17:35', '01'), m8: await barAt(p, THU, '17:37', '10'), m1: await barAt(p, THU, '17:44', '10'),
      over10: await barAt(p, THU, '17:34', '59'), at: await barAt(p, THU, '17:45'), q5: await barAt(p, THU, '17:50', '12'), end: await barAt(p, THU, '17:55'),
      fajr: await barAt(p, THU, '04:50'), dhuhr: await barAt(p, THU, '11:40'), dhuhrFri: await barAt(p, FRI, '11:40'), beforeFriday: await barAt(p, FRI, '11:35'),
      asr: await barAt(p, THU, '15:05'), isha: await barAt(p, THU, '19:20'), none: await barAt(p, THU, '13:00') };
    const tag = `adhan bar ${width}x${height} ${digits}`;
    check(`${tag}: no script errors`, !errors.length, errors.join('; '));
    check(`${tag}: the last 10 minutes: «الأذان بعد …», shown from exactly 10 minutes before, not 11`,
      !r.m10.hidden && r.m10.text === N('الأذان بعد ١٠ دقائق') && !r.m8.hidden && r.m8.text === N('الأذان بعد ٨ دقائق') && r.m1.text === N('الأذان بعد ١ دقيقة') && r.over10.hidden, JSON.stringify([r.m10, r.m8, r.m1, r.over10]));
    check(`${tag}: from the adhan to the iqama: «الإقامة بعد …» (Maghrib 10, Fajr 25, Asr and Isha 20, Dhuhr 20)`,
      r.at.text === N('الإقامة بعد ١٠ دقائق') && r.q5.text === N('الإقامة بعد ٥ دقائق') && r.end.hidden && r.fajr.text === N('الإقامة بعد ٢٥ دقيقة') && r.asr.text === N('الإقامة بعد ١٥ دقيقة')
      && r.isha.text === N('الإقامة بعد ١٥ دقيقة') && r.dhuhr.text === N('الإقامة بعد ٢٠ دقيقة'), JSON.stringify([r.at.text, r.q5.text, r.end.hidden, r.fajr.text, r.asr.text, r.isha.text, r.dhuhr.text]));
    check(`${tag}: Friday's Dhuhr has no iqama countdown, the adhan countdown before it is there; between prayers nothing`,
      r.dhuhrFri.hidden && !r.beforeFriday.hidden && r.none.hidden, JSON.stringify([r.dhuhrFri, r.beforeFriday.hidden, r.none.hidden]));
    check(`${tag}: a slim bar at the very top, across the screen`, r.m8.top === 0 && r.m8.h > 12 && r.m8.h < 0.035 * height + 1 && r.m8.w === width, JSON.stringify(r.m8));
    const clear = await p.evaluate(() => document.getElementById('adbar').getBoundingClientRect().bottom <= document.querySelector('.top').getBoundingClientRect().top + 1);
    check(`${tag}: the bar is above the date block and the weather (they start below it)`, clear, JSON.stringify(r.m8));
    await ctx.close();
  }
}
{   // off: never shown; the launcher's card mode never shows it; not before the times are known
  const off = await open('tv.html', 'panel=prayers&adhanbar=0');
  const a = await barAt(off.p, '2026-10-22', '17:37', '10');
  check('adhan bar: #adhanbar=0 turns it off', !off.errors.length && a.hidden, JSON.stringify(a));
  await off.ctx.close();
  const w = await open('tv.html', 'panel=prayers&widget=1', { width: 461, height: 250 });
  const b = await barAt(w.p, '2026-10-22', '17:37', '10');
  check('adhan bar: not in the launcher\'s card page (the home screen has its own)', !w.errors.length && b.hidden, JSON.stringify(b));
  await w.ctx.close();
  const e = await open('tv.html', 'panel=verse', { now: '2026-10-23T10:00:00Z' });   // a fixed time far from any prayer: the real clock may sit in an iqama window
  check('adhan bar: hidden until the times are known, no errors', !e.errors.length && await e.p.evaluate(() => { tickPrayer(); return document.getElementById('adbar').hidden; }));
  await e.ctx.close();
}

// ---- «يومك» (today): the next prayer, the next game of a followed team, the first open task, the next occasion; a line with
// nothing to say is left out. Beside the clock at three sizes, and in a home slot.
const TODAY_SEED = (o = {}) => `
  buildPrayers({ Fajr: '04:50', Sunrise: '06:05', Dhuhr: '11:40', Asr: '15:00', Maghrib: '17:45', Isha: '19:15' });
  MATCHES = {}; NEXT_LIST = {}; MATCHES_LOADED = true;
  ${o.game ? `{ const ev = { idEvent: 'T1', strHomeTeam: 'Al-Hilal', strAwayTeam: 'Al-Nassr', idHomeTeam: '100', idAwayTeam: '101', strSport: 'Soccer', strTimestamp: new Date(Date.now() + ${o.game} * 60000).toISOString() }; MATCHES['136013'] = ev; NEXT_LIST['136013'] = [ev]; }` : ''}
  renderPanel(false);`;
const todayRows = p => p.evaluate(() => [...document.querySelectorAll('#week-list li.td')].map(li => ({ k: li.querySelector('.k').textContent, v: li.querySelector('.v').textContent.replace(/\s+/g, ' ').trim(), r: (li.querySelector('.r') || {}).textContent || '' })));
for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540]]) {
  for (const digits of ['hindi', 'latin']) {
    const tasks = encodeURIComponent('اتصل بالسباك\nشراء حليب وخبز');
    const o = await open('tv.html', `teams=136013&panel=today&digits=${digits}&tasks=${tasks}`, { width, height, now: new Date('2026-10-22T13:40:00Z') });   // 16:40 Riyadh
    await o.p.evaluate(TODAY_SEED({ game: 150 }));
    const rows = await todayRows(o.p), hd = await o.p.evaluate(() => document.getElementById('week-hd').textContent);
    const fit = await o.p.evaluate(() => { const c = document.querySelector('.week').getBoundingClientRect(), clock = document.querySelector('.clockwrap').getBoundingClientRect(),
      bar = document.querySelector('.bottom').getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect();
      return { clear: c.top >= top.bottom && c.bottom <= bar.top - 4 && c.right <= clock.left - 4, cut: [...document.querySelectorAll('#week-list li, #week-list li *')].some(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1),
        dots: document.getElementById('week-list').textContent.includes('…'), text: document.getElementById('week-list').innerText }; });
    const tag = `today card ${width}x${height} ${digits}`, N = s => digits === 'latin' ? s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : s;
    check(`${tag}: no script errors, the title`, !o.errors.length && hd === 'يومك', o.errors.join('; ') + hd);
    check(`${tag}: four lines: the next prayer and its time, the game, the first open task, the occasion`,
      rows.length === 4 && rows[0].k === 'الصلاة القادمة' && rows[0].v === N('المغرب · ٥:٤٥ م') && /بعد/.test(rows[0].r)
      && rows[1].k === 'المباراة' && /الهلال/.test(rows[1].v) && /النصر/.test(rows[1].v) && /بعد ٣ ساعات|بعد 3 ساعات/.test(N(rows[1].r) + N('بعد ٣ ساعات'))
      && rows[2].k === 'المهمة' && rows[2].v === 'اتصل بالسباك' && rows[3].k === 'المناسبة القادمة' && /يوم/.test(rows[3].r), JSON.stringify(rows));
    check(`${tag}: fits: clear of the clock, the top and the bottom bar; no «…», nothing cut`, fit.clear && !fit.cut && !fit.dots, JSON.stringify(fit));
    check(`${tag}: ${digits === 'latin' ? 'Latin' : 'Arabic'} digits only`, digits === 'latin' ? !/[٠-٩]/.test(fit.text) : !/[0-9]/.test(fit.text), fit.text);
    // each line only if it has something: no game, no task
    await o.p.evaluate(TODAY_SEED({}));
    const a = await todayRows(o.p);
    check(`${tag}: no game this week: that line is left out`, a.length === 3 && !a.some(x => x.k === 'المباراة'), JSON.stringify(a));
    await o.ctx.close();
  }
}
{   // no task and no game: only the prayer and the occasion (the prayer times are computed offline until the day's own arrive)
  const o = await open('tv.html', 'panel=today', { now: new Date('2026-10-22T13:40:00Z') });
  const before = await todayRows(o.p);
  await o.p.evaluate(TODAY_SEED({}));
  const after = await todayRows(o.p);
  check('today card: no task and no game: only the prayer and the occasion, whatever the times (computed offline, then the day\'s own)',
    before.length === 2 && after.length === 2 && after[0].k === 'الصلاة القادمة' && after[1].k === 'المناسبة القادمة', JSON.stringify([before, after]));
  await o.ctx.close();
}
{   // in a home slot, next to another card, at the slot's size; the occasion's own day reads «اليوم»
  for (const W of [1920, 1280, 960]) {
    const [bw, bh] = homeBox(2, W);
    const o = await open('tv.html', `teams=136013&home_panel=today,prayerrow&widget=1&tasks=${encodeURIComponent('اتصل بالسباك')}`, { width: bw, height: bh, now: new Date('2026-10-22T13:40:00Z') });
    await o.p.evaluate(TODAY_SEED({ game: 90 }));
    const r = await homeProbe(o.p), rows = await todayRows(o.p);
    check(`today card in a home slot, screen ${W} (${bw}x${bh}): four lines, no overlap, no «…», nothing cut off`, !o.errors.length && rows.length === 4 && !r.overlap.length && !r.outside.length && !r.dots.length && !r.cut.length, JSON.stringify({ r, rows }) + o.errors.join('; '));
    await o.ctx.close();
  }
}

// ---- the settings' pickers draw the focused card live: the page itself, card only (#panel=<choice>&cardstyle=<style>&widget=1) with the
// current settings, in a box of 400 x 260 (SettingsActivity.pickWithPreview). Every choice and every style: no errors, drawn, inside the box.
const PREVIEW = [400, 260];
for (const panel of ['shows', 'prayers', 'forecast', 'hourly', 'prayerrow', 'matches', 'verse', 'wisdom', 'adhkar', 'stocks', 'tasks', 'year', 'smart', 'today']) {
  for (const style of ['current', 'dark1', 'glass1', 'dark3', 'glass3']) {
    if (style !== 'current' && !['verse', 'matches', 'prayerrow', 'hourly', 'today', 'adhkar'].includes(panel)) continue;
    const o = await open('tv.html', `city=%D8%AC%D8%AF%D8%A9&lat=21.5433&lon=39.1728&teams=136013&stocks=2222,1120,AAPL&tasks=${encodeURIComponent('اتصل بالسباك\nشراء حليب')}&panel=${panel}&cardstyle=${style}&widget=1`,
      { width: PREVIEW[0], height: PREVIEW[1], now: HOME_NOW });
    await o.p.evaluate(HOME_SEED() + ' renderPanel(false);');
    const r = await o.p.evaluate(() => { const c = CARDS[0].el.getBoundingClientRect(), t = document.getElementById('week-list').innerText;
      return { kinds: CARDS.map(x => x.kind).join(), cs: document.documentElement.className.match(/cs-\S+/)?.[0] || '', inside: c.left >= -.5 && c.right <= innerWidth + .5 && c.bottom <= innerHeight + .5, h: Math.round(c.height),
        text: t.length, dots: t.includes('…'), bg: getComputedStyle(document.body).backgroundColor }; });
    check(`preview ${panel} / ${style}: the card alone on a transparent page, in its style, inside the ${PREVIEW.join('x')} box, no script errors`,
      !o.errors.length && r.kinds === panel && r.cs === (style === 'current' ? '' : 'cs-' + style) && r.inside && r.text > 0 && !r.dots && r.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(r) + o.errors.join('; '));
    await o.ctx.close();
  }
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall page tests passed');
process.exit(failed ? 1 : 0);
