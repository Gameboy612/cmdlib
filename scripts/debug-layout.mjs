import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('.dv-groupview')].map((g) => {
    const r = g.getBoundingClientRect();
    return { rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}, tabs: [...g.querySelectorAll('.dv-tab')].map(t => t.textContent?.trim()) };
  });
  const dock = document.querySelector('.dv-dockview');
  const dr = dock?.getBoundingClientRect();
  return { groups, dock: dr && {x:dr.x,y:dr.y,w:dr.width,h:dr.height}, body: document.body.innerText.slice(0,300) };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/editor2.png' });
await browser.close();
