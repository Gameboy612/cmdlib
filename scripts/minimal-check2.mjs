import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1800);
await page.screenshot({path:'/tmp/min-final.png'});
const tabs = await page.evaluate(()=>[...document.querySelectorAll('.dv-tab')].map(t=>t.textContent?.trim()));
// Edit -> Undo test: type at end, undo
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('# undo-test');
await page.waitForTimeout(300);
const before = (await page.locator('.cm-content').innerText()).includes('undo-test');
await page.getByRole('button',{name:'Edit',exact:true}).click();
await page.getByRole('menuitem',{name:'Undo'}).click();
await page.waitForTimeout(400);
const after = (await page.locator('.cm-content').innerText()).includes('undo-test');
// view labels
await page.getByRole('button',{name:'View',exact:true}).click();
await page.waitForTimeout(200);
const viewItems = await page.locator('[role="menuitem"]').allTextContents();
await page.keyboard.press('Escape');
// problems
await page.getByRole('button',{name:'View',exact:true}).click();
await page.getByRole('menuitem',{name:'Problems'}).click();
await page.waitForTimeout(500);
const problems = await page.locator('body').innerText();
await page.screenshot({path:'/tmp/min-final-problems.png'});
console.log(JSON.stringify({tabs,before,after,viewItems,unusedInProblems:problems.includes('never called by this pack'),demoButtons:await page.getByText('Demo',{exact:true}).count(),errors},null,2));
await browser.close();
