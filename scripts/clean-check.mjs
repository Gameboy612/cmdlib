import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1700);
await page.screenshot({path:'/tmp/clean-editor.png'});
const info = await page.evaluate(()=>({
  tabs:[...document.querySelectorAll('.dv-tab')].map(t=>t.textContent?.trim()),
  files:[...document.querySelectorAll('[class*="treeName"]')].map(e=>e.textContent?.trim()),
  title:document.title,
  lint:[...document.querySelectorAll('[class*="statusItem"]')].map(e=>e.textContent?.trim()),
  body:document.body.innerText.slice(0,500),
}));
console.log(JSON.stringify({info,errors},null,2));
await browser.close();
