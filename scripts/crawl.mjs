import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const bad=[];
page.on('response', r=>{ if(r.status()>=400) bad.push([r.status(), r.url()]); });
const pages=['/','/editor/','/credits/'];
for (const path of pages) {
  await page.goto('http://127.0.0.1:4199'+path, { waitUntil:'networkidle' });
  await page.waitForTimeout(500);
  const urls = await page.evaluate(() => [...document.querySelectorAll('a[href], img[src], link[href]')].map(e=>e.getAttribute('href')||e.getAttribute('src')).filter(Boolean));
  console.log(path, [...new Set(urls)].filter(u=>u.startsWith('/')&&!u.startsWith('/_next')).slice(0,30));
}
console.log('bad', bad);
await browser.close();
