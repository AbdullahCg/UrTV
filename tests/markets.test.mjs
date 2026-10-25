import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {});
try {
  const page = await browser.newPage({ viewport: { width:1920, height:1080 } });
  await page.route(/^https?:/, route => route.abort());
  await page.goto(pathToFileURL(path.resolve('dist/tv.html')).href
    + '#markets=tasi,spx,btc&mkstyle=prices&digits=latin&slot=markets&gap=0');
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await page.waitForTimeout(100);
  const result = await page.evaluate(async () => {
    const stamp = Date.now();
    window.fetch = async url => {
      const data = String(url).includes('coingecko')
        ? {bitcoin:{usd:67890.12, usd_24h_change:1.2, last_updated_at:stamp}}
        : {chart:{result:[{meta:{regularMarketPrice:12345.67,regularMarketTime:stamp},indicators:{quote:[{close:[12400,12345.67]}]}}]}};
      return {ok:true, json:async () => data};
    };
    await loadMarkets();
    const initial = TICKERS.map(t => ({key:t.key, text:document.getElementById(t.px).textContent,
      hidden:document.getElementById(t.px).hidden, quote:MK_LAST[t.key]}));
    saveSnap();
    restoreSnap();
    window.fetch = async () => { throw new TypeError('offline'); };
    await loadMarkets();
    const preserved = initial.every(t => document.getElementById(t.key + '-px').textContent === t.text);
    const bounds = document.querySelector('.markets').getBoundingClientRect();
    return {initial,preserved,bounds:{left:bounds.left,right:bounds.right,bottom:bounds.bottom}};
  });
  assert(result.initial.every(v => !v.hidden && v.text && v.quote && v.quote.at > 0));
  assert.equal(result.initial.find(v => v.key === 'tasi').quote.price, 12345.67);
  assert.equal(result.initial.find(v => v.key === 'btc').quote.price, 67890.12);
  assert(result.preserved, 'offline quotes retain the last visible price');
  assert(result.bounds.left >= 0 && result.bounds.right <= 1920 && result.bounds.bottom < 350);
  console.log('PASS market values, quote timestamps, offline retention, snapshot restoration, layout');
} finally { await browser.close(); }
