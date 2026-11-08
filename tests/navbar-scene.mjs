import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.AMY_NAVBAR_URL||'http://127.0.0.1:4173/AMY-v2.0/';
const output=process.env.AMY_NAVBAR_OUTPUT||'test-results/navbar-scene';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={url:base,browser:browser.version(),checks:[],cases:[],errors:[]};
const check=(name,pass,detail)=>{report.checks.push({name,pass:Boolean(pass),detail});assert(pass,name+': '+JSON.stringify(detail));};
async function state(page){return page.evaluate(()=>{
  const nav=document.querySelector('.jj-navbar'),stage=document.querySelector('.amy-stage');
  return{y:scrollY,wipe:Number(stage.dataset.wipe),light:nav.classList.contains('jj-navbar--light-scene'),background:getComputedStyle(nav.querySelector('.jj-header')).backgroundImage,
    color:getComputedStyle(nav.querySelector('.jj-center-title')).color,menu:nav.classList.contains('menu-is-open')};
});}
async function painted(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function scenario(name,options,run){
  console.log('START '+name);const context=await browser.newContext({viewport:{width:1440,height:900},...options}),page=await context.newPage();page.setDefaultTimeout(12000);
  const errorsBefore=report.errors.length;
  page.on('pageerror',e=>report.errors.push({name,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({name,message:m.text()});});
  try{await run(page);check(name+' no unexpected errors',report.errors.length===errorsBefore);report.cases.push({name,status:'PASS'});}
  catch(e){let captured;try{captured=await state(page);await page.screenshot({path:output+'/'+name+'-failure.png'});}catch{}report.cases.push({name,status:'FAIL',failure:e.stack,state:captured});console.error('FAIL '+name+': '+e.message);}
  finally{await context.close();}
}
async function ready(page,suffix){
  await page.goto(base+suffix,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.nebulosaPreview?.getState().ready&&!document.querySelector('.startup-cover'));
  await painted(page);await page.mouse.move(8,40);
}
try{
  await scenario('step-transition-and-reverse',{},async page=>{
    await ready(page,'?scroll=steps#amy-home');
    await page.waitForFunction(()=>document.querySelector('.jj-navbar').classList.contains('jj-navbar--light-scene'));
    const hero=await state(page);check('Hero has dark ink and portrait backdrop',hero.light&&hero.background!=='none'&&hero.color==='rgb(36, 25, 30)',hero);
    await page.mouse.wheel(0,120);
    await page.waitForFunction(()=>Number(document.querySelector('.amy-stage').dataset.wipe)>=.7);
    await painted(page);const entering=await state(page);
    check('Incoming Helix clears portrait backdrop during moving wipe',!entering.light&&entering.background==='none'&&entering.color==='rgb(244, 244, 245)',entering);
    await page.screenshot({path:output+'/helix-during.png'});
    await page.waitForFunction(()=>!document.querySelector('.grow-portal-frame').inert&&document.querySelector('.grow-portal-frame').dataset.settled==='true');
    await painted(page);const helix=await state(page);check('Settled Helix remains transparent with light ink',!helix.light&&helix.background==='none',helix);
    await page.screenshot({path:output+'/helix-after.png'});
    await page.mouse.wheel(0,-120);await page.waitForFunction(()=>Number(document.querySelector('.amy-stage').dataset.wipe)<=.3);
    await painted(page);const returning=await state(page);check('Reverse restores portrait navbar before wipe finishes',returning.light&&returning.background!=='none'&&returning.color==='rgb(36, 25, 30)',returning);
    await page.waitForFunction(()=>Number(document.querySelector('.amy-stage').dataset.wipe)<=.0004);await painted(page);
    await page.screenshot({path:output+'/hero-return.png'});
    await page.locator('.jj-menu-btn').click();await page.waitForFunction(()=>document.querySelector('.jj-navbar').classList.contains('menu-is-open'));await painted(page);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.jj-brand-left')).color==='rgb(244, 244, 245)');
    const menu=await state(page);check('Open menu clears portrait backdrop and keeps light controls',menu.menu&&menu.background==='none'&&await page.locator('.jj-brand-left').evaluate(el=>getComputedStyle(el).color==='rgb(244, 244, 245)'),menu);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.jj-navbar').classList.contains('menu-is-open'));await painted(page);
    check('Closing menu restores portrait backdrop',(await state(page)).background!=='none');
  });
  for(const [name,options] of [['cold-helix',{}],['cold-mobile-helix',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
    await scenario(name,options,async page=>{await ready(page,'#agents');await page.waitForFunction(()=>document.querySelector('.grow-portal-frame').dataset.settled==='true');await painted(page);const s=await state(page);check(name+' has no portrait band',!s.light&&s.background==='none'&&s.color==='rgb(244, 244, 245)',s);});
  }
  await scenario('default-wheel-mode',{},async page=>{
    await ready(page,'#amy-home');await page.waitForFunction(()=>document.querySelector('.jj-navbar').classList.contains('jj-navbar--light-scene'));
    for(let i=0;i<8;i++){await page.mouse.wheel(0,300);await painted(page);if(await page.evaluate(()=>Number(document.querySelector('.amy-stage').dataset.wipe)>=.7))break;}
    await page.waitForFunction(()=>Number(document.querySelector('.amy-stage').dataset.wipe)>=.7);await painted(page);const s=await state(page);check('Default native/pulse mode clears portrait band as well',!s.light&&s.background==='none',s);
  });
  report.status=report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
}catch(e){report.status='FAIL';report.failure=e.stack;}
finally{await browser.close();await writeFile(output+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.checks.filter(c=>c.pass).length,total:report.checks.length,cases:report.cases,errors:report.errors},null,2));if(report.status!=='PASS')process.exitCode=1;}
