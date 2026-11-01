import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const failed = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('response', r => { if (r.status() >= 400) failed.push([r.status(), r.url()]); });
await page.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// live at 95%
await page.evaluate(() => { const el = document.getElementById('run'); window.scrollTo(0, el.offsetTop + (el.offsetHeight - innerHeight) * 0.96); });
await page.waitForTimeout(1400);
await page.screenshot({ path: '/tmp/q-run-late.png' });
// credits
await page.goto('http://127.0.0.1:4199/credits/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/q-credits.png' });
// editor interactions
await page.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// run demo via toolbar
await page.getByRole('button', { name: 'Demo', exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/q-editor-demo.png' });
const sidebarText = await page.locator('text=Dev').first().textContent().catch(() => null);
// console
const input = page.getByLabel('Minecraft command');
await input.fill('scoreboard players get @s points');
await input.press('Enter');
await page.waitForTimeout(600);
const consoleText = await page.locator('text=/has 300/').count();
// palette
await page.keyboard.press('Control+k');
await page.waitForTimeout(300);
const paletteVisible = await page.getByRole('dialog', { name: 'Command palette' }).isVisible();
await page.keyboard.type('problems');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/q-editor-problems.png' });
// version switch
await page.selectOption('select[aria-label="Target Minecraft version"]', '1.20.4');
await page.waitForTimeout(1000);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cmdlib:project:v1') || '{}'));
const meta = stored.files?.['pack.mcmeta'] ?? '';
const hasFunctions = Object.keys(stored.files ?? {}).some((p) => p.includes('/functions/'));
await page.screenshot({ path: '/tmp/q-editor-1204.png' });
await page.selectOption('select[aria-label="Target Minecraft version"]', '26.3');
await page.waitForTimeout(900);
// autocomplete: open palette? focus editor and type
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('function ');
await page.waitForTimeout(700);
const completionVisible = await page.locator('.cm-tooltip-autocomplete').isVisible().catch(() => false);
await page.screenshot({ path: '/tmp/q-editor-complete.png' });
console.log(JSON.stringify({ errors, failed, sidebarText, consoleText, paletteVisible, hasFunctions, meta: meta.slice(0,120), completionVisible }, null, 2));
// mobile editor run button
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto('http://127.0.0.1:4199/editor/', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(1800);
const mobileRun = await mobile.getByRole('button', { name: 'Run load tags' }).isVisible().catch(() => false);
await mobile.screenshot({ path: '/tmp/q-mobile-editor2.png' });
console.log('mobileRun', mobileRun);
await browser.close();
