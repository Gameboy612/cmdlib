import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',
  args: ['--no-sandbox','--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landing-top.png' });
await page.screenshot({ path: '/tmp/landing-full.png', fullPage: true });
// scroll to live stage
await page.evaluate(() => { const el = document.querySelector('#run'); if (el) el.scrollIntoView(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landing-run.png' });
// editor
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/editor.png' });
console.log('ERRORS', JSON.stringify(errors, null, 2));
console.log('TITLE', await page.title());
await browser.close();
