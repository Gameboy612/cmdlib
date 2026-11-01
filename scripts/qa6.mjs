import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.selectOption('select[aria-label="Target Minecraft version"]', '1.20.4');
await page.waitForTimeout(1600);
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cmdlib:project:v1') || '{}'));
const paths = Object.keys(stored.files ?? {});
console.log('1204', paths.filter(p=>p.includes('function')), (stored.files?.['pack.mcmeta']??'').replace(/\s+/g,' ').slice(0,100));
const lens = await page.locator('text=/errors/').allTextContents();
await page.screenshot({ path: '/tmp/q-1204-fixed2.png' });
await page.selectOption('select[aria-label="Target Minecraft version"]', '26.3');
await page.waitForTimeout(1600);
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cmdlib:project:v1') || '{}'));
console.log('263', Object.keys(stored.files ?? {}).filter(p=>p.includes('function')), (stored.files?.['pack.mcmeta']??'').replace(/\s+/g,' ').slice(0,120));
await page.screenshot({ path: '/tmp/q-263-back.png' });
// float via context menu
await page.locator('.dv-tab', { hasText: 'World preview' }).first().click({ button: 'right' });
await page.waitForTimeout(400);
const floatItem = page.getByText('Float', { exact: true }).first();
const hasFloat = await floatItem.count();
if (hasFloat) { await floatItem.click(); }
await page.waitForTimeout(700);
const floating = await page.locator('.dv-floating-group, .dv-resize-container').count();
await page.screenshot({ path: '/tmp/q-floating.png' });
console.log({hasFloat, floating, errors});
await browser.close();
