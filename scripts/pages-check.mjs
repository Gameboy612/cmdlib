import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[], failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()])});
await page.goto('http://127.0.0.1:4200/cmdlib/', {waitUntil:'networkidle'});
await page.waitForTimeout(900);
const info = await page.evaluate(() => ({
  title: document.title,
  fonts: {
    bricolage: document.fonts.check("16px '__Bricolage_Grotesque_placeholder'") || null,
    loaded: [...document.fonts].map(f=>({family:f.family,status:f.status})).slice(0,6),
  },
  imgs: [...document.images].map(i=>({src:i.getAttribute('src'), ok:i.complete && i.naturalWidth>0})),
  editorHref: document.querySelector('a[href*="editor"]')?.getAttribute('href'),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  og: document.querySelector('meta[property="og:image"]')?.content,
}));
await page.screenshot({path:'/tmp/pages-home.png'});
await page.getByRole('link', {name:/Open the editor/i}).first().click();
await page.waitForTimeout(1800);
const editor = await page.evaluate(() => ({path: location.pathname, title: document.title, cm: !!document.querySelector('.cm-editor')}));
await page.screenshot({path:'/tmp/pages-editor.png'});
console.log(JSON.stringify({info, editor, errors, failed}, null, 2));
await browser.close();
