import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1600);
// add an unused function from the File menu
page.on('dialog', async (dialog) => { await dialog.accept('orphan'); });
await page.getByRole('button',{name:'File',exact:true}).click();
await page.getByRole('menuitem',{name:'New function'}).click();
await page.waitForTimeout(900);
const unusedBadges = await page.locator('[aria-label="Unused function"]').count();
const problems = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Problems');
  return null;
});
// open Problems via View
await page.getByRole('button',{name:'View',exact:true}).click();
await page.getByRole('menuitem',{name:'Problems'}).click();
await page.waitForTimeout(500);
const body = await page.locator('body').innerText();
const unusedInProblems = body.includes('never called by this pack');
const tabs = await page.evaluate(()=>[...document.querySelectorAll('.dv-tab')].map(t=>t.textContent?.trim()));
const files = await page.evaluate(()=>[...document.querySelectorAll('[class*="treeName"]')].map(e=>e.textContent?.trim()));
await page.screenshot({path:'/tmp/final-clean-editor.png'});
// landing lint section count
await page.goto('http://127.0.0.1:4199/', {waitUntil:'networkidle'});
await page.waitForTimeout(700);
await page.evaluate(()=>document.getElementById('lint').scrollIntoView());
await page.waitForTimeout(1000);
const lintText = await page.locator('#lint').innerText();
console.log(JSON.stringify({unusedBadges,unusedInProblems,tabs,files,errors,lintHasMacro:lintText.includes('macro-required'),lintHasUnknown:lintText.includes('unknown-objective'),lintHasGive:lintText.includes('unsupported-command')},null,2));
await browser.close();
