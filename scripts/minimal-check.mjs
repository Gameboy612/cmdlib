import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1800);
await page.screenshot({path:'/tmp/min-editor.png'});
const tabs = await page.evaluate(()=>[...document.querySelectorAll('.dv-tab')].map(t=>t.textContent?.trim()));
const unused = await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Unused function"]')].length);
const demos = await page.getByText('Demo', {exact:true}).count();
const headers = await page.evaluate(()=>[...document.querySelectorAll('[class*="panelHead"]')].length);
const menuTriggers = await page.locator('header button').allTextContents();
// open view menu
await page.getByRole('button',{name:'View', exact:true}).click();
await page.waitForTimeout(300);
await page.screenshot({path:'/tmp/min-menu.png'});
const menuItems = await page.locator('[role="menuitem"]').allTextContents();
await page.keyboard.press('Escape');
// problems
await page.getByRole('button',{name:'View', exact:true}).click();
await page.getByRole('menuitem',{name:'Problems'}).click();
await page.waitForTimeout(600);
const problemsText = await page.locator('body').innerText();
const unusedInProblems = problemsText.includes('never called by this pack');
await page.screenshot({path:'/tmp/min-problems.png'});
console.log(JSON.stringify({tabs,unused,demos,headers,menuTriggers,menuItems,unusedInProblems,errors},null,2));
await browser.close();
