import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
// migration
await page.selectOption('select[aria-label="Target Minecraft version"]', '1.20.4');
await page.waitForTimeout(1200);
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cmdlib:project:v1') || '{}'));
const paths = Object.keys(stored.files ?? {});
console.log('1204 paths', paths.filter(p=>p.includes('function')));
console.log('meta', (stored.files?.['pack.mcmeta'] ?? '').replace(/\s+/g,' ').slice(0,160));
await page.screenshot({ path: '/tmp/q-1204-fixed.png' });
// back
await page.selectOption('select[aria-label="Target Minecraft version"]', '26.3');
await page.waitForTimeout(1200);
stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cmdlib:project:v1') || '{}'));
console.log('263 paths', Object.keys(stored.files ?? {}).filter(p=>p.includes('function')));
// panels storage / entities
await page.getByRole('button', { name: /Panels/ }).click();
await page.getByRole('menuitem', { name: 'Storage' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/q-storage.png' });
await page.getByRole('button', { name: /Panels/ }).click();
await page.getByRole('menuitem', { name: 'Entities' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/q-entities.png' });
// context menu
await page.locator('.dv-tab', { hasText: 'Entities' }).first().click({ button: 'right' });
await page.waitForTimeout(500);
const menuText = await page.locator('body').innerText();
console.log('float?', menuText.includes('Float'), 'close?', menuText.includes('Close'));
await page.screenshot({ path: '/tmp/q-ctx.png' });
await page.keyboard.press('Escape');
// autocomplete explicit
await page.locator('.dv-tab', { hasText: 'Editor' }).first().click();
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('run');
await page.keyboard.press('Control+Space');
await page.waitForTimeout(600);
const options = await page.locator('.cm-tooltip-autocomplete li').allTextContents().catch(()=>[]);
await page.screenshot({ path: '/tmp/q-autocomplete.png' });
console.log('autocomplete', options.slice(0,5));
console.log('errors', errors);
await browser.close();
