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

async function open(file, hash, { width = 1920, height = 1080, seed = true, net = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
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
  clearTimeout(ADHKAR_T); ADHKAR_T = 0; ADHKAR_I = 0; ADHKAR_MODE = '';
  renderPanel(false);
  const hd = document.getElementById('week-hd');
  return { hd: hd.textContent.replace(/\s+/g, ' ').trim(), icon: !!hd.querySelector('svg'), timer: ADHKAR_T !== 0,
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
    clearTimeout(ADHKAR_T); ADHKAR_T = 0; ADHKAR_I = 0; ADHKAR_MODE = ''; renderPanel(false);
    for (let k = 0; k < 5; k++) {
      const li = document.querySelectorAll('#week-list li'), ft = li[1].textContent.replace(/\s+/g, ' ');
      out.push([li[0].textContent.replace(/[\u064B-\u065F﴿]/g, '').split(' ')[0], ft, [...li[1].querySelectorAll('.d i')].map(i => +i.classList.contains('on')).join(''),
                document.querySelector('#week-list').classList.contains('flip')]);
      adhkarNext();
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
    adhkarNext();
    return [document.getElementById('week-hd').textContent, ADHKAR_T];
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
      ADHKAR_MODE = ''; ADHKAR_I = i; clearTimeout(ADHKAR_T); ADHKAR_T = 0; renderPanel(false);
      const c = card.getBoundingClientRect(), ft = card.querySelector('.adf'), f = ft.getBoundingClientRect();
      const wide = [...card.querySelectorAll('.hd *, .adf *')].some(e => e.getBoundingClientRect().right > c.right + 1 || e.getBoundingClientRect().left < c.left - 1);
      if (c.top < top.bottom || c.bottom > bar.top - 4 || c.right > clock.left - 4 || c.height > 0.42 * innerHeight || f.bottom > c.bottom + 1
          || ft.scrollWidth > ft.clientWidth + 1 || wide) bad.push(i + ':' + Math.round(c.height) + '/' + Math.round(0.42 * innerHeight));
    }
    ADHKAR_T && clearTimeout(ADHKAR_T);
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
      CONFIG.panel = 'adhkar'; renderPanel(false);
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
    LIST_PAGE++; renderPanel(false);
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
      LIST_PAGE = 1; renderPanel(false);
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

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall page tests passed');
process.exit(failed ? 1 : 0);
