import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/home/kapak/.cache/ms-playwright/chromium-1187/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4199/editor/', {waitUntil:'networkidle'});
await page.waitForTimeout(1300);
const input=page.getByLabel('Minecraft command');
for (const cmd of [
 'give @s writable_book[writable_book_content={pages:["hello page"]}] 1',
 'give @s apple 2',
 'give @s carrot_on_a_stick 1',
]) { await input.fill(cmd); await input.press('Enter'); await page.waitForTimeout(100); }
await page.keyboard.press('Control+k'); await page.waitForTimeout(150); await page.getByLabel('Search actions').fill('Inventory'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
const boxes=page.locator('[class*="itemBox"]');
// mainhand hotbar0 is first filled; right click
await boxes.filter({hasText:'WR'}).first().click({button:'right'});
await page.waitForTimeout(300);
const menuText=await page.locator('[role="menu"]').innerText().catch(()=>'(none)');
await page.getByRole('menuitem',{name:'Edit book'}).click().catch(()=>{});
await page.waitForTimeout(300);
const modalVisible=await page.getByLabel('Book page').isVisible().catch(()=>false);
const pageValue=await page.getByLabel('Book page').inputValue().catch(()=>'');
if (modalVisible) { await page.getByLabel('Book page').fill('edited page'); await page.getByRole('button',{name:'Save page'}).click(); await page.waitForTimeout(250); }
// use apple
const apple=page.locator('[class*="itemBox"]').filter({hasText:'AP'}).first();
await apple.click({button:'right'}); await page.waitForTimeout(250);
const appleMenu=await page.locator('[role="menu"]').innerText().catch(()=>'(none)');
await page.getByRole('menuitem',{name:'Use item'}).click().catch(()=>{});
await page.waitForTimeout(300);
const body=await page.locator('body').innerText();
await page.screenshot({path:'/tmp/item-use.png'});
console.log(JSON.stringify({menuText,modalVisible,pageValue,appleMenu,toastAte:body.includes('Ate apple'),errors},null,2));
await browser.close();
