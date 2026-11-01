import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const active = () => page.evaluate(() => [...document.querySelectorAll('.dv-tab.dv-active-tab')].map(t=>t.textContent?.trim()));
console.log('initial', await active());
// panels menu
await page.getByRole('button', { name: /Panels/ }).click();
await page.getByRole('menuitem', { name: 'Problems' }).click();
await page.waitForTimeout(500);
console.log('after menu problems', await active());
// palette
await page.keyboard.press('Control+k');
await page.waitForTimeout(300);
await page.keyboard.type('storage');
await page.waitForTimeout(400);
const items = await page.locator('.paletteItem, [class*="paletteItem"]').allTextContents().catch(()=>[]);
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
console.log('after palette storage', await active(), items.slice(0,5));
// inspect tab context menu
await page.locator('.dv-tab', { hasText: 'Editor' }).first().click({ button: 'right' });
await page.waitForTimeout(300);
const menu = await page.locator('.dv-context-menu, [class*="context-menu"]').allTextContents().catch(()=>[]);
console.log('context', menu);
await page.keyboard.press('Escape');
// layout persistence
const before = await page.evaluate(() => [...document.querySelectorAll('.dv-groupview')].map(g=>Math.round(g.getBoundingClientRect().width)));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const after = await page.evaluate(() => [...document.querySelectorAll('.dv-groupview')].map(g=>Math.round(g.getBoundingClientRect().width)));
console.log('widths', before, after);
await page.screenshot({ path: '/tmp/q-persist.png' });
await browser.close();
