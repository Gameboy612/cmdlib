import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true });
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1600);
await page.screenshot({path:'docs/screenshots/mobile-editor.png'});
await browser.close();
