import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.env.AMY_STEPS_URL || 'http://127.0.0.1:4173/AMY-v2.0/';
const output = process.env.AMY_STEPS_OUTPUT || 'test-results/screen-steps';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const report={url:root,browser:browser.version(),method:'Chrome native wheel/keyboard/CDP; no physical mouse',checks:[],cases:[],errors:[]};
const check=(name,pass,detail)=>{report.checks.push({name,pass:Boolean(pass),detail});assert(pass,name+': '+JSON.stringify(detail));};
async function settle(page){let last=-1,stable=0;for(let i=0;i<60;i++){const y=await page.evaluate(()=>scrollY);stable=Math.abs(y-last)<=1?stable+1:0;if(stable>=3)return y;last=y;await delay(80);}throw Error('Scroll did not settle');}
async function ready(page,fragment=''){
  await page.goto(root+'?scroll=steps'+fragment,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('.startup-cover')&&window.nebulosaPreview?.getState().ready,{},{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);await settle(page);await page.mouse.move(8,40);
}
async function read(page){return page.evaluate(()=>{
  const s=window.nebulosaPreview.getState(),hero=document.querySelector('.amy-hero'),css=getComputedStyle(hero),h=document.querySelector('.amy-stage').offsetHeight;
  return{y:scrollY,phase:s.phase,progress:s.progress,pan:s.pan,birth:s.birth,amy:s.amyForm,closing:s.closingProgress,flowStart:s.flowHoldStart,flowEnd:s.flowHoldEnd,
    heroStart:h*Number(css.getPropertyValue('--hero-transition')),heroEnd:h*(Number(css.getPropertyValue('--hero-transition'))+Number(css.getPropertyValue('--hero-dwell'))),
    max:document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight,links:document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length,
    portal:!document.querySelector('.grow-portal-frame').inert&&document.querySelector('.grow-portal-frame').dataset.settled==='true',about:!document.querySelector('.amy-about').inert};
});}
async function destination(page,label){
  await page.waitForFunction(label=>{
    const s=window.nebulosaPreview.getState(),y=scrollY,hero=document.querySelector('.amy-hero'),h=document.querySelector('.amy-stage').offsetHeight,css=getComputedStyle(hero);
    if(label==='Gameplay')return y<=1;
    if(label==='Hero')return y>=h*Number(css.getPropertyValue('--hero-transition'))-1&&y<=h*(Number(css.getPropertyValue('--hero-transition'))+Number(css.getPropertyValue('--hero-dwell')))+1&&document.querySelector('.amy-stage').dataset.phase==='settled';
    if(label==='Helix')return y>=s.flowHoldStart-1&&y<=s.flowHoldEnd+1&&s.pan===0&&!document.querySelector('.grow-portal-frame').inert&&document.querySelector('.grow-portal-frame').dataset.settled==='true';
    if(label==='Solar')return s.phase==='field'&&s.birth===1&&s.amyForm===0;
    if(label==='AMY')return s.phase==='hold'&&document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length===5;
    return s.closingProgress===1&&!document.querySelector('.amy-about').inert&&Math.abs(y-(document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight))<=1;
  },label,{timeout:10000});await settle(page);const state=await read(page);check('Arrived '+label,true,state);return state;
}
async function scenario(name,options,action){
  console.log('START '+name);const context=await browser.newContext({viewport:{width:1440,height:900},...options});const page=await context.newPage();page.setDefaultTimeout(12000);
  const errorStart=report.errors.length;
  page.on('pageerror',e=>report.errors.push({case:name,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({case:name,message:m.text()});});
  await page.addInitScript(()=>{window.stepWheel=[];addEventListener('wheel',e=>window.stepWheel.push({trusted:e.isTrusted,at:performance.now(),delta:e.deltaY,y:scrollY}),{capture:true,passive:true});});
  try{await action(page,context);check(name+' has no unexpected errors',report.errors.length===errorStart);report.cases.push({name,status:'PASS'});}
  catch(e){let state;try{state=await read(page);await page.screenshot({path:output+'/'+name+'-failure.png'});}catch{}report.cases.push({name,status:'FAIL',failure:e.stack,state});console.error('FAIL '+name+': '+e.message);}
  finally{await context.close();}
}
try{
  await scenario('forward-and-reverse',{},async page=>{
    await ready(page);check('Cold entry remains at zero',await page.evaluate(()=>scrollY===0));
    for(const label of ['Hero','Helix','Solar','AMY','Setup']){
      await page.mouse.wheel(0,120);await destination(page,label);
      if(['Solar','AMY','Setup'].includes(label))await page.screenshot({path:output+'/'+label+'.png'});
    }
    const end=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,120);check('No blank tail beyond Setup',(await settle(page))===end);
    for(const label of ['AMY','Solar','Helix','Hero','Gameplay']){await page.mouse.wheel(0,-120);await destination(page,label);}
  });
  await scenario('one-rapid-burst-one-screen',{},async(page,context)=>{
    await ready(page,'#amy-home');const client=await context.newCDPSession(page),pending=[];
    for(let i=0;i<20;i++){pending.push(client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120}));await delay(12);}await Promise.all(pending);
    await destination(page,'Helix');const events=await page.evaluate(()=>stepWheel);
    check('Burst is trusted and delivered as one gesture',events.length>1&&events.every(e=>e.trusted)&&events.slice(1).every((e,i)=>e.at-events[i].at<=160),events);
    const y=await page.evaluate(()=>scrollY);await delay(300);check('Burst tail does not advance to Solar',Math.abs(await page.evaluate(()=>scrollY)-y)<=1);
    await page.mouse.wheel(0,120);await destination(page,'Solar');
  });
  await scenario('long-burst-does-not-scroll-incoming-panel',{},async(page,context)=>{
    await ready(page,'#amy-home');const before=await page.locator('.grow-layout').evaluate(el=>el.scrollTop);
    const client=await context.newCDPSession(page),pending=[];
    for(let i=0;i<80;i++){pending.push(client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:300,y:450,deltaX:0,deltaY:120}));await delay(15);}await Promise.all(pending);
    await destination(page,'Helix');const after=await page.locator('.grow-layout').evaluate(el=>el.scrollTop),events=await page.evaluate(()=>stepWheel);
    check('Long burst remains one trusted gesture',events.length>1&&events.every(e=>e.trusted)&&events.slice(1).every((e,i)=>e.at-events[i].at<=160),events);
    check('Incoming inner panel does not consume the same burst tail',after===before,{before,after});
  });
  await scenario('reversal-and-chaining',{},async(page,context)=>{
    await ready(page,'#amy-home');const client=await context.newCDPSession(page);const initial=await read(page);
    const first=client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120});
    await page.waitForFunction(y=>scrollY>y+35,initial.y);
    const beforeReverse=await read(page);
    await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:-120});await first;
    const reversed=await destination(page,'Hero');
    const reverseInput=await page.evaluate(()=>stepWheel.findLast(event=>event.delta<0));
    check('Reverse arrived before Helix arrival',reverseInput.y<initial.flowStart,{beforeReverse,reverseInput});
    check('Reversing up never adds forward travel after native input arrival',reversed.y<=reverseInput.y+1,{reverseInput,reversed});
    const next=client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120});
    await page.waitForFunction(()=>stepWheel.length&&performance.now()-stepWheel.at(-1).at>190&&scrollY>900);
    const beforeChain=await read(page);
    await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120});await next;
    await destination(page,'Solar');check('Fresh gesture chained before Helix arrival',beforeChain.y<beforeChain.flowStart,beforeChain);
  });
  await scenario('reverse-a-chained-transition',{},async(page,context)=>{
    await ready(page,'#amy-home');const client=await context.newCDPSession(page);
    const first=client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120});
    await page.waitForFunction(()=>stepWheel.length&&performance.now()-stepWheel.at(-1).at>190&&scrollY>900);
    const chain=client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:120});
    await page.waitForFunction(()=>stepWheel.length===2);
    const before=await read(page);check('Chained reverse starts before reaching Helix',before.y<before.flowStart,before);
    await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:-120});await Promise.all([first,chain]);
    const after=await destination(page,'Hero'),input=await page.evaluate(()=>stepWheel.findLast(event=>event.delta<0));
    check('Chained reverse reached input before Helix and returned toward reached Hero',input.y<before.flowStart&&after.y<=input.y+1,{before,input,after});
  });
  await scenario('nested-menu-and-keyboard',{viewport:{width:1280,height:600}},async page=>{
    await ready(page,'#agents');await page.locator('[data-section="habilidades"]').click();
    const before=await page.locator('.grow-layout').evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight,y:scrollY}));
    check('Nested panel has remaining space',before.max-before.top>20,before);
    const box=await page.locator('.grow-layout').boundingBox();await page.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await page.mouse.wheel(0,120);
    await page.waitForFunction(top=>document.querySelector('.grow-layout').scrollTop>top,before.top);
    await settle(page);const after=await page.locator('.grow-layout').evaluate(el=>({top:el.scrollTop,y:scrollY}));
    check('Native nested wheel leaves document at Helix',after.top>before.top&&Math.abs(after.y-before.y)<=1,{before,after});
    await page.locator('.jj-menu-btn').click();const menuY=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,120);await delay(200);check('Menu excludes stepping',Math.abs(await page.evaluate(()=>scrollY)-menuY)<=1);
    await page.locator('.jj-nav-link[href="#gear"]').click();await destination(page,'Setup');
    await page.keyboard.press('PageUp');await destination(page,'AMY');
    await page.keyboard.press('PageDown');await destination(page,'Setup');
  });
  for(const [name,options]of[['reduced-native',{reducedMotion:'reduce'}],['coarse-native',{hasTouch:true,viewport:{width:390,height:844},isMobile:true}]]){
    await scenario(name,options,async page=>{await ready(page);const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,120);const after=await settle(page);check(name+' keeps native 120px',Math.abs(after-before-120)<=2,{before,after});});
  }
  await scenario('default-mode-preserved',{},async page=>{
    await page.goto(root);await page.waitForFunction(()=>!document.querySelector('.startup-cover')&&window.nebulosaPreview?.getState().ready);await settle(page);await page.mouse.move(8,40);const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,120);const after=await settle(page);check('Default remains pulse120 to360',Math.abs(after-before-360)<=2,{before,after});
  });
  report.status=report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
}catch(e){report.status='FAIL';report.failure=e.stack;}
finally{await browser.close();await writeFile(output+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.checks.filter(c=>c.pass).length,total:report.checks.length,cases:report.cases,errors:report.errors},null,2));if(report.status!=='PASS')process.exitCode=1;}
