import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {});
try {
  const page = await browser.newPage({ viewport: { width:1920, height:1080 } });
  await page.route(/^https?:/, route => route.abort());
  await page.goto(pathToFileURL(path.resolve('dist/tv.html')).href);
  const result = await page.evaluate(async () => {
    const stamp = 1792580400;
    window.fetch = async url => ({ok:true, json:async () => String(url).includes('coingecko')
      ? {bitcoin:{usd:67890.12, usd_24h_change:1.2, last_updated_at:stamp}}
      : {chart:{result:[{meta:{regularMarketPrice:12345.67,regularMarketTime:stamp},indicators:{quote:[{close:[12400,12345.67]}]}}]}}});
    await Promise.all(TICKERS.map(loadTicker));
    saveSnap();
    restoreSnap();
    const initial = TICKERS.map(t => ({text:document.getElementById(t.price).textContent,
      hidden:document.getElementById(t.price).hidden,
      time:document.getElementById(t.price).dataset.quoteTime,
      stamp:!!document.querySelector('#'+t.price+' .asof')}));
    window.fetch = async () => { throw new Error('offline'); };
    await Promise.all(TICKERS.map(loadTicker));
    paintPrice(TICKERS[0], NaN);
    const preserved = document.getElementById('tasi-price').textContent === initial[0].text;
    const bounds = document.querySelector('.markets').getBoundingClientRect();
    return {initial,preserved,bounds:{left:bounds.left,right:bounds.right,bottom:bounds.bottom}};
  });
  assert(result.initial.every(v => !v.hidden && v.stamp && v.time === '1792580400000'));
  assert(result.initial[0].text.includes('12,345.67'));
  assert(result.initial[2].text.startsWith('$67,890.12'));
  assert(result.preserved, 'offline/invalid quotes retain their original as-of timestamp');
  assert(result.bounds.left >= 0 && result.bounds.right <= 1920 && result.bounds.bottom < 350);
  await page.screenshot({path:'optimize/markets-preview.png'});
  console.log('PASS market values, provider timestamps, offline retention, snapshot restoration, layout');
} finally { await browser.close(); }
