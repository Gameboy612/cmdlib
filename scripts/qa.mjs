import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/q-hero.png' });
const sections = ['loop','run','workbench','versions','lint','close'];
for (const id of sections) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: id === 'run' ? top + (el.offsetHeight - window.innerHeight) * 0.55 : top + 60, behavior: 'instant' });
  }, id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/q-${id}.png` });
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/q-editor.png' });
console.log('ERRORS', JSON.stringify(errors, null, 2));
// mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
await mobile.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: '/tmp/q-mobile-hero.png' });
await mobile.evaluate(() => window.scrollTo(0, document.getElementById('run').offsetTop + 100));
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: '/tmp/q-mobile-run.png' });
await mobile.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(1800);
await mobile.screenshot({ path: '/tmp/q-mobile-editor.png' });
await browser.close();
