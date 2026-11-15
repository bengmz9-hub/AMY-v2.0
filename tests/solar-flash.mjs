import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {solarFlashAmount,solarPortraitGather,solarChargeAmount,solarCollapseAmount,solarBurstAmount,solarYellowRetention} from '../src/components/scenes/nebulosa/engine/solar-flash.js';
const base=process.env.AMY_FLASH_URL||'http://127.0.0.1:4173/AMY-v2.0/';
const output=process.env.AMY_FLASH_OUTPUT||'test-results/solar-flash';
await mkdir(output,{recursive:true});
const report={base,checks:[],frames:[],errors:[],method:'Controlled GPU frames plus separate native journey; no physical mouse'};
const check=(name,pass,detail)=>{report.checks.push({name,pass:Boolean(pass),detail});assert(pass,name+': '+JSON.stringify(detail));};
check('Pulse is finite, bounded and zero outside the single attack/release',
  [NaN,Infinity,-1,0,.28,.53,1,2].every(x=>solarFlashAmount(x)===0)&&
  Array.from({length:1001},(_,i)=>solarFlashAmount(i/1000)).every(x=>Number.isFinite(x)&&x>=0&&x<=1));
// Fusion: one brief soft kiss that rises from .28 to its .40 peak and is gone by .53.
const pulse=Array.from({length:251},(_,i)=>solarFlashAmount(.28+i/1000));
check('Pulse has one peak and a brief release',solarFlashAmount(.40)===1&&solarFlashAmount(.30)<solarFlashAmount(.36)&&solarFlashAmount(.44)>solarFlashAmount(.50)&&
  pulse.slice(0,121).every((x,i,a)=>!i||x>=a[i-1])&&pulse.slice(120).every((x,i,a)=>!i||x<=a[i-1]));
// The staggered grains start forming before the kiss and the mean grain is complete as it clears.
check('Portrait forms under the glow before it clears',solarPortraitGather(.06)===0&&solarPortraitGather(.28)>0&&solarPortraitGather(.40)>.75&&solarPortraitGather(.49)>.99&&solarFlashAmount(.49)>.2&&solarPortraitGather(.53)===1);
// .60 is where the last staggered GPU grain arrives.
check('No portrait assembly remains after the glow release',Array.from({length:201},(_,i)=>.6+i/500).every(g=>solarPortraitGather(g)===1));
check('Fusion has no charged core or shock ring',Array.from({length:1001},(_,i)=>i/1000).every(g=>solarChargeAmount(g)===0&&solarBurstAmount(g)===0));
check('Charge is absent at both protected endpoints',solarChargeAmount(0)===0&&solarChargeAmount(1)===0);
check('The yellow source field hands over its light by the peak',solarYellowRetention(0)===1&&solarYellowRetention(.40)===0&&solarYellowRetention(1)===0);
const browser=await chromium.launch({channel:'chrome',headless:true});
async function contextPage(url,options={}){
 const context=await browser.newContext({viewport:{width:1440,height:900},...options}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>document.getElementById('main')?.dataset.startup==='ready'&&!document.querySelector('.startup-cover'),null,{timeout:30000});
 return{context,page};
}
async function frame(page,gather,endpoint){return page.evaluate(async({gather,endpoint})=>{
 const layout=nebulosaPreview.getState().layout;
 let range=layout.ranges.amy,t=gather;
 if(endpoint)range=layout.ranges[endpoint==='solar'?'field':'hold'],t=.5;
 else {let low=0,high=1;for(let i=0;i<40;i++){const m=(low+high)/2;if(m*m*(3-2*m)<gather)low=m;else high=m;}t=(low+high)/2;}
 amyReview.setPresentationVisible(true);amyReview.setStoryProgress(range[0]+(range[1]-range[0])*t);
 amyReview.setMotionFrame({time:12.5,strength:0,cursorX:.5,cursorY:.5,yaw:0,pitch:0});amyReview.renderFrame();
 const canvas=document.querySelector('#webgl-canvas'),gl=canvas.getContext('webgl2'),rgba=new Uint8Array(canvas.width*canvas.height*4);
 gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);let energy=0,white=0,bright=0,core=0,coreCount=0,edge=0,edgeCount=0,radiusEnergy=0,center=0,centerCount=0,brightEnergy=0,brightRadiusEnergy=0;
 for(let i=0;i<rgba.length;i+=4){const y=rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722,pixel=i/4,xn=(pixel%canvas.width)/canvas.width*2-1,yn=Math.floor(pixel/canvas.width)/canvas.height*2-1;energy+=y;if(y>190)bright++;
  const r2=(xn*canvas.width/canvas.height)**2+yn*yn;radiusEnergy+=y*r2;if(r2<.03*.03){center+=y;centerCount++;}
  // Measure the emitting core separately from the faint coloured background.
  if(y>128){brightEnergy+=y;brightRadiusEnergy+=y*r2;}
  if(xn*xn+yn*yn<.28*.28){core+=y;coreCount++;}if(Math.abs(xn)>.75||Math.abs(yn)>.75){edge+=y;edgeCount++;}if(rgba[i]>245&&rgba[i+1]>245&&rgba[i+2]>245)white++;}
 const png=canvas.toDataURL('image/png');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),x=>x.toString(16).padStart(2,'0')).join('');
 const stats=amyReview.getStats();
 let delta=0;const previous=window.__solarCheckPixels;
 if(previous?.length===rgba.length){for(let i=0;i<rgba.length;i+=4)delta+=Math.abs(rgba[i]-previous[i])+Math.abs(rgba[i+1]-previous[i+1])+Math.abs(rgba[i+2]-previous[i+2]);delta/=rgba.length/4*3;}
 window.__solarCheckPixels=rgba;
 return{gather,endpoint,hash,delta,radius:Math.sqrt(radiusEnergy/Math.max(energy,.0001)),brightRadius:Math.sqrt(brightRadiusEnergy/Math.max(brightEnergy,.0001)),centerMean:center/centerCount,mean:energy/(rgba.length/4),coreMean:core/coreCount,edgeMean:edge/edgeCount,brightFraction:bright/(rgba.length/4),whiteFraction:white/(rgba.length/4),error:gl.getError(),flash:stats.yellowPost.solarFlash||0,charge:stats.yellowPost.solarCharge||0,collapse:stats.yellowPost.solarCollapse||0,burst:stats.yellowPost.solarBurst||0,portrait:stats.yellowPost.portraitGather,png};
 },{gather,endpoint});}
try{
 const baseline=await contextPage('https://bengmz9-hub.github.io/AMY-v2.0/'),local=await contextPage(base);
 try{
  for(const boundary of [.06,.28,.53,.60]){await frame(local.page,boundary-.0001);const coarse=await frame(local.page,boundary+.0001);await frame(local.page,boundary-.00001);const fine=await frame(local.page,boundary+.00001);
   check('GPU image converges continuously across the burst boundary '+boundary,fine.delta<1&&fine.delta<=coarse.delta*.3+.01&&fine.error===0,{coarseChange:coarse.delta,fineChange:fine.delta,steps:[.0002,.00002]});}
  for(const endpoint of ['solar','amy']){const a=await frame(baseline.page,0,endpoint),b=await frame(local.page,0,endpoint);
   check('Exact protected GPU endpoint '+endpoint,a.hash===b.hash&&b.error===0&&b.flash===0,{baseline:a.hash,local:b.hash,flash:b.flash});}
  const quiet=await frame(local.page,.015),inflow=await frame(local.page,.20),onset=await frame(local.page,.28),peak=await frame(local.page,.40),reveal=await frame(local.page,.49);
  check('Fusion inflow condenses the field toward the nexus',onset.collapse>.35&&onset.centerMean>inflow.centerMean,{inflow:inflow.centerMean,onset:onset.centerMean,collapse:onset.collapse});
  // The fusion kiss is deliberately soft: it lights the nexus but stays below the former >200 pearl core.
  check('Peak soft kiss lights the nexus without a pearl core',peak.centerMean>onset.centerMean*1.4&&peak.centerMean<200,{onset:onset.centerMean,peak:peak.centerMean});
  check('The portrait is in place while the glow releases',reveal.portrait>.99&&reveal.flash>.2,{portrait:reveal.portrait,flash:reveal.flash});
  check('Pulse preserves the dark screen perimeter',peak.edgeMean<=quiet.edgeMean*1.1+1,{before:quiet.edgeMean,after:peak.edgeMean});
  check('Pulse is contained instead of a full-screen flash',peak.mean<quiet.mean*1.4&&peak.brightFraction<.2&&peak.flash>.99&&peak.error===0,{before:quiet.mean,after:peak.mean,brightFraction:peak.brightFraction,flash:peak.flash});
  for(const gather of [.015,.20,.28,.34,.40,.46,.49,.53,.60,.80,1]){const f=await frame(local.page,gather);await writeFile(output+'/gather-'+gather+'.png',Buffer.from(f.png.split(',')[1],'base64'));const{png,...data}=f;report.frames.push(data);
   check('GPU charge, glow and reveal match their envelopes at '+gather,Math.abs(f.flash-solarFlashAmount(gather))<.00001&&Math.abs(f.portrait-solarPortraitGather(gather))<.00001&&Math.abs(f.charge-solarChargeAmount(gather))<.00001&&Math.abs(f.collapse-solarCollapseAmount(gather))<.00001&&Math.abs(f.burst-solarBurstAmount(gather))<.00001&&f.error===0,data);}
  const forward=await frame(local.page,.32);await frame(local.page,.7);const reverse=await frame(local.page,.32);
  check('Reversing progress retraces the same controlled GPU burst',forward.hash===reverse.hash,{forward:forward.hash,reverse:reverse.hash});
  const released=await frame(local.page,.60),formedEnd=await frame(local.page,1);
  check('No glow or assembly residue once the last grain arrives',released.hash===formedEnd.hash&&released.flash===0,{released:released.hash,formed:formedEnd.hash});
 }finally{await baseline.context.close();await local.context.close();}
 const reduced=await contextPage(base,{reducedMotion:'reduce'});try{const f=await frame(reduced.page,.4);check('Reduced-motion preference is ignored: the flash still plays',f.flash>.99&&f.error===0,{flash:f.flash,error:f.error});}finally{await reduced.context.close();}
 const native=await contextPage(base);try{await native.page.locator('.jj-menu-btn').click();await native.page.locator('.jj-nav-link[href="#agents"]').click();await native.page.waitForFunction(()=>document.querySelector('.grow-portal-frame').dataset.settled==='true');await native.page.mouse.move(8,40);
 const sampling=native.page.evaluate(()=>new Promise(resolve=>{const samples=[],start=performance.now();function tick(now){const s=nebulosaPreview.getState();samples.push({at:now-start,phase:s.phase,flash:s.engine.yellowPost.solarFlash||0,charge:s.engine.yellowPost.solarCharge||0,collapse:s.engine.yellowPost.solarCollapse||0,portrait:s.engine.yellowPost.portraitGather});if(now-start<7000&&(s.phase!=='hold'||now-start<500))requestAnimationFrame(tick);else resolve(samples);}requestAnimationFrame(tick);}));
 await native.page.mouse.wheel(0,120);await native.page.waitForFunction(()=>nebulosaPreview.getState().phase==='hold',null,{timeout:10000});const samples=await sampling;report.nativeSamples=samples;
 check('One native wheel includes a single flare then an unlit AMY endpoint',Math.max(...samples.map(s=>s.flash))>.9&&samples.at(-1).flash===0&&await native.page.locator('a.nebulosa-social[data-link-active="true"]').count()===5);
 check('Native glow clears over an already formed portrait',samples.findIndex(s=>s.portrait>=.999)<samples.findLastIndex(s=>s.flash>0)&&samples.filter(s=>s.at>=samples.findLast(s=>s.flash>0).at).every(s=>s.portrait===1));
 check('One native gesture fuses the grains then reveals AMY through its release',samples.findIndex(s=>s.collapse>.3)>=0&&samples.findIndex(s=>s.flash>0)>samples.findIndex(s=>s.collapse>.3)&&samples.some(s=>s.portrait>.99&&s.flash>0)&&samples.every(s=>s.charge===0));
 const pulseEnd=samples.findLast(s=>s.flash>0)?.at,formed=samples.find(s=>s.portrait>=.999)?.at;
 check('There is no assembly tail after the light clears',formed<pulseEnd,{pulseEnd,formed,millisecondsBeforeRelease:pulseEnd-formed});
 await native.page.screenshot({path:output+'/native-amy.png'});await native.page.mouse.wheel(0,-120);await native.page.waitForFunction(()=>nebulosaPreview.getState().phase==='flowHold'&&document.querySelector('.grow-portal-frame').dataset.settled==='true',null,{timeout:10000});check('Native reverse returns to Helix',true);
 }finally{await native.context.close();}
 check('No unexpected JS/shader errors',report.errors.length===0,report.errors);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally{await browser.close();await writeFile(output+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.checks.filter(c=>c.pass).length,total:report.checks.length,errors:report.errors,failure:report.failure},null,2));}
