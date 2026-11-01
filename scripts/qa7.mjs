import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
for (const [id, file] of [['versions','/tmp/q-versions2.png'],['workbench','/tmp/q-workbench2.png'],['lint','/tmp/q-lint2.png']]) {
  await page.evaluate((id) => { const el = document.getElementById(id); window.scrollTo(0, el.getBoundingClientRect().top + scrollY + 40); }, id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: file });
}
// mobile run top
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await m.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await m.evaluate(() => { const el = document.getElementById('run'); window.scrollTo(0, el.offsetTop + 10); });
await m.waitForTimeout(900);
await m.screenshot({ path: '/tmp/q-mobile-run2.png' });
// mobile preview tab
await m.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await m.waitForTimeout(1600);
await m.getByRole('tab', { name: 'World' }).click();
await m.waitForTimeout(700);
await m.screenshot({ path: '/tmp/q-mobile-preview.png' });
await browser.close();
