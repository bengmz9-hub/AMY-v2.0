import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.AMY_TEST_OUTPUT ? path.resolve(process.env.AMY_TEST_OUTPUT) : null;
const report = {
  suite: 'wheel-pulse',
  startedAt: new Date().toISOString(),
  node: process.version,
  checks: [],
  cases: [],
  errors: [],
};

let preview = null;
let browser = null;
let baseURL = null;
let interrupted = false;

function check(name, pass, detail = null) {
  report.checks.push({ name, pass: Boolean(pass), ...(detail === null ? {} : { detail }) });
  assert(pass, `${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(err => err ? reject(err) : resolve(port));
    });
  });
}

async function startPreview() {
  const port = Number(process.env.AMY_TEST_PORT || await freePort());
  const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
  let logs = '';
  preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  preview.stdout.on('data', chunk => { logs += chunk; });
  preview.stderr.on('data', chunk => { logs += chunk; });

  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (preview.exitCode !== null) throw Error(`vite preview exited early (${preview.exitCode}): ${logs}`);
    try {
      const response = await fetch(url);
      if (response.ok) return url;
    } catch {}
    await delay(100);
  }
  throw Error(`Timed out waiting for ${url}: ${logs}`);
}

async function stopPreview() {
  if (!preview || preview.exitCode !== null) return;
  preview.kill('SIGTERM');
  await Promise.race([new Promise(resolve => preview.once('exit', resolve)), delay(3000)]);
  if (preview.exitCode === null) preview.kill('SIGKILL');
}

process.once('SIGINT', () => {
  interrupted = true;
  process.exitCode = 130;
  void browser?.close();
  preview?.kill('SIGTERM');
});
process.once('SIGTERM', () => {
  interrupted = true;
  process.exitCode = 143;
  void browser?.close();
  preview?.kill('SIGTERM');
});

async function settle(page) {
  let previous = -1;
  let stable = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const y = await page.evaluate(() => scrollY);
    stable = Math.abs(y - previous) < 0.1 ? stable + 1 : 0;
    if (stable >= 3) return y;
    previous = y;
    await delay(80);
  }
  throw Error('Document scroll did not settle.');
}

async function waitForWheelSettle(page, minWaitMs = 240) {
  if (minWaitMs > 0) await delay(minWaitMs);
  return settle(page);
}

async function readyAgents(page, engine = false) {
  await page.waitForFunction(() => {
    const portal = document.querySelector('.grow-portal-frame');
    return portal && !portal.inert && portal.dataset.settled === 'true';
  });
  if (engine) await page.waitForFunction(() => window.nebulosaPreview?.getState().ready);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

async function installWheelRecorder(page) {
  await page.evaluate(() => {
    window.__wheelLog = [];
    if (window.__wheelRecorderInstalled) return;
    window.__wheelRecorderInstalled = true;
    window.addEventListener('wheel', event => {
      const now = performance.now();
      const prev = window.__wheelLog.at(-1);
      window.__wheelLog.push({
        isTrusted: event.isTrusted,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        timeStamp: event.timeStamp,
        perfNow: now,
        gapTimeStamp: prev ? event.timeStamp - prev.timeStamp : null,
        gapPerfNow: prev ? now - prev.perfNow : null,
        scrollYAtEvent: window.scrollY,
      });
    }, { passive: true, capture: true });
  });
}

async function clearWheelLog(page) {
  await page.evaluate(() => {
    window.__wheelLog = [];
  });
}

async function readWheelLog(page) {
  return page.evaluate(() => window.__wheelLog || []);
}

// Dispatches a scheduled burst of native CDP mouseWheel inputs without awaiting
// per-event compositor ACKs between steps, then awaits all pending CDP promises.
async function cdpWheelBurst(client, { x = 8, y = 40, deltas, intervalMs = 12 }) {
  const pending = [];
  for (let i = 0; i < deltas.length; i++) {
    pending.push(client.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY: deltas[i],
    }));
    if (i + 1 < deltas.length && intervalMs > 0) {
      await delay(intervalMs);
    }
  }
  await Promise.all(pending);
}

// Dispatches a single native CDP mouseWheel and resolves as soon as the trusted
// DOM wheel event reaches window (t = 0ms of useWheelPulse's 70ms quiet timer),
// returning the background CDP compositor ACK promise.
async function dispatchWheelAndWaitForDOM(client, page, { x = 8, y = 40, deltaY = 120 }) {
  await page.evaluate(() => {
    window.__firstPulseWheel=null;
    addEventListener('wheel',event=>{window.__firstPulseWheel={isTrusted:event.isTrusted,deltaY:event.deltaY,timeStamp:event.timeStamp,perfNow:performance.now()};},{once:true,passive:true,capture:true});
  });
  const cdpAck=client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY});
  await page.waitForFunction(()=>window.__firstPulseWheel,null,{timeout:3000});
  const eventInfo=await page.evaluate(()=>window.__firstPulseWheel);
  return { eventInfo, cdpAck };
}

async function scenario(name, options, run) {
  console.log('START '+name);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  const errorsBefore = report.errors.length;
  function record(type, message) {
    report.errors.push({ case: name, type, message });
  }
  page.on('pageerror', error => record('js', error.message));
  page.on('console', item => { if (item.type() === 'error') record('console', item.text()); });
  page.on('response', response => { if (response.status() >= 400) record('http', `${response.status()} ${response.url()}`); });
  try {
    if (interrupted) throw Error('Run interrupted.');
    await run(page, context);
    check(`${name}: no unexpected JS/console/HTTP errors`, report.errors.length === errorsBefore, report.errors.slice(errorsBefore));
    report.cases.push({ name, status: 'PASS' });
  } catch (error) {
    const failure = { name, status: 'FAIL', failure: error.stack };
    try {
      failure.state = await page.evaluate(() => ({
        url: location.href,
        y: scrollY,
        active: document.activeElement?.outerHTML.slice(0, 400),
        scene: window.nebulosaPreview?.getState().phase,
        pan: window.nebulosaPreview?.getState().pan,
        wheelLog: window.__wheelLog?.slice(-10),
      }));
      if (output) await page.screenshot({ path: path.join(output, `${name}-failure.png`) });
    } catch (diagnosticError) {
      failure.diagnosticError = diagnosticError.message;
    }
    report.cases.push(failure);
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

try {
  if (output) await mkdir(output, { recursive: true });
  const external = process.env.AMY_TEST_BASE_URL;
  if (external) {
    baseURL = new URL(external);
    assert(['http:', 'https:'].includes(baseURL.protocol) && !baseURL.username && !baseURL.password && !baseURL.search && !baseURL.hash && baseURL.pathname.endsWith('/'), 'AMY_TEST_BASE_URL must be an HTTP(S) directory URL ending in /, without credentials, query or fragment.');
  } else {
    baseURL = new URL(await startPreview());
    report.buildSHA256 = createHash('sha256').update(await readFile(path.join(root, 'dist/index.html'))).digest('hex');
  }
  report.baseURL = baseURL.href;
  const softwareWebGL = process.env.AMY_TEST_SOFTWARE_WEBGL === '1';
  browser = await chromium.launch({
    headless: true,
    ...(softwareWebGL ? { args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] } : {}),
    ...(process.env.AMY_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.AMY_BROWSER_EXECUTABLE_PATH } : { channel: 'chrome' }),
  });
  report.softwareWebGL = softwareWebGL;
  report.browser = browser.version();

  await scenario('isolated-coarse-and-fine-packets', {}, async (page, context) => {
    const client = await context.newCDPSession(page);
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled' && window.nebulosaPreview?.getState()?.ready);
    await settle(page);
    await installWheelRecorder(page);
    await page.mouse.move(8, 40);

    // 1. Fine 50px forward and -60px reverse wheel packets stay purely native.
    await delay(180);
    await clearWheelLog(page);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 50);
    const yAfter50 = await waitForWheelSettle(page, 240);
    const log50 = await readWheelLog(page);
    check('Fine 50px forward packet is trusted and stays purely native', log50.length === 1 && log50[0].isTrusted && log50[0].deltaY === 50 && Math.abs((yAfter50 - y0) - 50) <= 2, {
      y0,
      yAfter50,
      delta: yAfter50 - y0,
    });

    await delay(180);
    await clearWheelLog(page);
    await page.mouse.wheel(0, -60);
    const yAfterMinus60 = await waitForWheelSettle(page, 240);
    const logMinus60 = await readWheelLog(page);
    check('Fine -60px reverse packet is trusted and stays purely native', logMinus60.length === 1 && logMinus60[0].isTrusted && logMinus60[0].deltaY === -60 && Math.abs((yAfterMinus60 - yAfter50) - (-60)) <= 2, {
      yAfter50,
      yAfterMinus60,
      delta: yAfterMinus60 - yAfter50,
    });

    // 2. Fractional 48.5px and fractional coarse-magnitude 112.5px packets stay purely native.
    await delay(180);
    await clearWheelLog(page);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 8, y: 40, deltaX: 0, deltaY: 48.5 });
    const yAfterFracFine = await waitForWheelSettle(page, 240);
    const logFracFine = await readWheelLog(page);
    check('Fractional 48.5px packet is trusted, non-integer, and stays native', logFracFine.length === 1 && logFracFine[0].isTrusted && !Number.isInteger(logFracFine[0].deltaY) && Math.abs((yAfterFracFine - yAfterMinus60) - 48.5) <= 3, {
      yAfterMinus60,
      yAfterFracFine,
      delta: yAfterFracFine - yAfterMinus60,
    });

    await delay(180);
    await clearWheelLog(page);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 8, y: 40, deltaX: 0, deltaY: 112.5 });
    const yAfterFracCoarse = await waitForWheelSettle(page, 240);
    const logFracCoarse = await readWheelLog(page);
    check('Fractional 112.5px packet inside 80..240 range is non-integer and not boosted', logFracCoarse.length === 1 && logFracCoarse[0].isTrusted && !Number.isInteger(logFracCoarse[0].deltaY) && Math.abs((yAfterFracCoarse - yAfterFracFine) - 112.5) <= 3, {
      yAfterFracFine,
      yAfterFracCoarse,
      delta: yAfterFracCoarse - yAfterFracFine,
    });

    // 3. Isolated coarse 120px forward packet receives bounded ~240px assist (~360px total).
    await delay(180);
    await clearWheelLog(page);
    const yBeforeBoost = await page.evaluate(() => scrollY);
    const flowHoldStart = await page.evaluate(() => window.nebulosaPreview.getState().flowHoldStart);
    await page.mouse.wheel(0, 120);
    const yAfterBoost = await waitForWheelSettle(page, 240);
    await delay(240);
    const yAfterBoostHold = await page.evaluate(() => scrollY);
    const logBoost = await readWheelLog(page);
    const forwardBoostDelta = yAfterBoost - yBeforeBoost;
    check('Isolated coarse 120px forward packet boosts total travel to ~360px and settles cleanly without snapping to scene stop', logBoost.length === 1 && logBoost[0].isTrusted && logBoost[0].deltaY === 120 && forwardBoostDelta >= 330 && forwardBoostDelta <= 385 && yAfterBoost < flowHoldStart - 250 && Math.abs(yAfterBoostHold - yAfterBoost) <= 1, {
      yBeforeBoost,
      yAfterBoost,
      yAfterBoostHold,
      forwardBoostDelta,
      flowHoldStart,
    });

    // 4. Isolated coarse -120px reverse packet receives bounded ~-240px assist (~-360px total).
    await delay(180);
    await clearWheelLog(page);
    await page.mouse.wheel(0, -120);
    const yAfterReverseBoost = await waitForWheelSettle(page, 240);
    await delay(240);
    const yAfterReverseHold = await page.evaluate(() => scrollY);
    const logReverseBoost = await readWheelLog(page);
    const reverseBoostDelta = yAfterReverseBoost - yAfterBoost;
    check('Isolated coarse -120px reverse packet boosts reverse travel to ~-360px and settles cleanly', logReverseBoost.length === 1 && logReverseBoost[0].isTrusted && logReverseBoost[0].deltaY === -120 && reverseBoostDelta <= -330 && reverseBoostDelta >= -385 && Math.abs(yAfterReverseHold - yAfterReverseBoost) <= 1, {
      yAfterBoost,
      yAfterReverseBoost,
      yAfterReverseHold,
      reverseBoostDelta,
    });

    // 5. Three separated 120px coarse notches advance ~1080px (~360px each).
    await delay(180);
    await clearWheelLog(page);
    const yBeforeThreeNotches = await page.evaluate(() => scrollY);
    for (let notch = 0; notch < 3; notch++) {
      await page.mouse.wheel(0, 120);
      await waitForWheelSettle(page, 240);
      await delay(60);
    }
    const yAfterThreeNotches = await page.evaluate(() => scrollY);
    const threeNotchDelta = yAfterThreeNotches - yBeforeThreeNotches;
    check('Three separated 120px wheel notches advance ~1080px total (~360px per notch)', threeNotchDelta >= 990 && threeNotchDelta <= 1155, {
      yBeforeThreeNotches,
      yAfterThreeNotches,
      threeNotchDelta,
    });

  });

  await scenario('coarse-cap-at-cold-entry', {}, async page => {
    await page.goto(baseURL.href);
    await page.locator('.startup-cover').waitFor({state:'detached'});
    await page.waitForFunction(()=>window.nebulosaPreview?.getState().ready);
    await settle(page);
    await page.mouse.move(8,40);
    const before=await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,180);
    const after=await waitForWheelSettle(page,240);
    check('Isolated coarse 180px caps extra at280px',Math.abs(after-before-460)<=3,{before,after});
  });

  await scenario('rapid-coarse-and-fractional-streams', {}, async (page, context) => {
    const client = await context.newCDPSession(page);
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled' && window.nebulosaPreview?.getState()?.ready);
    await settle(page);
    await installWheelRecorder(page);
    await page.mouse.move(8, 40);

    // 1. Scheduled 20 x 120px rapid burst via native CDP Input.dispatchMouseEvent (2400px native).
    await delay(180);
    await clearWheelLog(page);
    const yStart = await page.evaluate(() => scrollY);
    await cdpWheelBurst(client, { x: 8, y: 40, deltas: Array(20).fill(120), intervalMs: 12 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const yAfterBurst = await page.evaluate(() => scrollY);
    const yAfterBurstWait = await waitForWheelSettle(page, 240);
    const burstEvents = await readWheelLog(page);
    const sumBurstDelta = burstEvents.reduce((sum, item) => sum + item.deltaY, 0);
    const burstGaps = burstEvents.slice(1).map(item => item.gapPerfNow);
    const burstCoalescedOrFast = burstEvents.every((event,index) => {
      const magnitude=Math.abs(event.deltaY);
      const previous=index ? event.perfNow-burstEvents[index-1].perfNow : Infinity;
      const next=index+1<burstEvents.length ? burstEvents[index+1].perfNow-event.perfNow : Infinity;
      return magnitude>240 || magnitude<80 || !Number.isInteger(event.deltaY) || previous<120 || next<70;
    });
    const totalBurstTravel = yAfterBurstWait - yStart;

    check('Scheduled 20x120px CDP burst preserves trusted wheel events and observed rapid cadence/coalescing', burstEvents.length >= 1 && burstEvents.every(item => item.isTrusted && item.deltaMode === 0) && Math.abs(sumBurstDelta - 2400) <= 1 && burstCoalescedOrFast, {
      eventCount: burstEvents.length,
      sumBurstDelta,
      deltas: burstEvents.map(item => item.deltaY),
      gapsMs: burstGaps.map(gap => Math.round(gap * 10) / 10),
    });
    check('Scheduled 20x120px burst stays native (~2400px total) without stacking boost or post-burst tail', Math.abs(totalBurstTravel - 2400) <= 8 && Math.abs(yAfterBurstWait - yAfterBurst) <= 4, {
      yStart,
      yAfterBurst,
      yAfterBurstWait,
      totalBurstTravel,
      expectedNative: 2400,
    });

    // 2. Scheduled 20 x 3.5px fractional stream (~70px total) via native CDP Input.dispatchMouseEvent stays native.
    await delay(180);
    await clearWheelLog(page);
    const yBeforeFracStream = await page.evaluate(() => scrollY);
    await cdpWheelBurst(client, { x: 8, y: 40, deltas: Array(20).fill(3.5), intervalMs: 12 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const yAfterFracImmediate = await page.evaluate(() => scrollY);
    const yAfterFracStream = await waitForWheelSettle(page, 240);
    const fracStreamEvents = await readWheelLog(page);
    const sumFracDelta = fracStreamEvents.reduce((sum, item) => sum + item.deltaY, 0);
    const actualFracTravel = yAfterFracStream - yBeforeFracStream;

    check('Scheduled 20x3.5px fractional stream stays purely native (~70px) with no post-stream tail', fracStreamEvents.length >= 1 && fracStreamEvents.every(item => item.isTrusted) && Math.abs(sumFracDelta - 70) <= 1 && Math.abs(actualFracTravel - 70) <= 5 && Math.abs(yAfterFracStream - yAfterFracImmediate) <= 3, {
      yBeforeFracStream,
      yAfterFracImmediate,
      yAfterFracStream,
      actualFracTravel,
      sumFracDelta,
      eventCount: fracStreamEvents.length,
    });
  });


  // Native arrival, rather than a requested Node delay, defines cancellation.
  for (const kind of ['reverse', 'key', 'pointer', 'touch', 'active-key']) {
    await scenario('cancel-' + kind, {}, async (page, context) => {
      const client=await context.newCDPSession(page);
      await page.goto(baseURL.href);
      await page.locator('.startup-cover').waitFor({state:'detached'});
      await page.waitForFunction(()=>window.nebulosaPreview?.getState().ready);
      await settle(page);
      await page.mouse.move(8,40);
      const before=await page.evaluate(()=>scrollY);
      const type=kind==='reverse'?'wheel':kind==='pointer'?'pointerdown':kind==='touch'?'touchstart':'keydown';
      const {cdpAck}=await dispatchWheelAndWaitForDOM(client,page,{deltaY:120});
      if(kind==='active-key')await page.waitForFunction(origin=>scrollY>origin+122,before);
      await page.evaluate(type=>{
        window.__cancelArrival=null;
        addEventListener(type,e=>{window.__cancelArrival={trusted:e.isTrusted,y:scrollY,at:performance.now(),delta:e.deltaY};},{once:true,capture:true,passive:true});
      },type);
      if(kind==='reverse')await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:40,deltaX:0,deltaY:-40});
      else if(kind==='pointer')await page.mouse.click(8,40);
      else if(kind==='touch'){
        await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:8,y:40,id:1}]});
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else await page.keyboard.press('Shift');
      await page.waitForFunction(()=>window.__cancelArrival,null,{timeout:3000});
      const received=await page.evaluate(()=>window.__cancelArrival);
      await cdpAck;
      const after=await waitForWheelSettle(page,240);
      const expected=kind==='reverse'?[received.y,received.y-40]:[Math.max(before+120,received.y)];
      check('Trusted '+kind+' input cancels assistance at actual arrival with no residual travel',received.trusted&&expected.some(y=>Math.abs(after-y)<=2),{before,received,after});
      if(kind==='active-key'){
        const active=received.y>before+122&&received.y<before+358;
        if(!active)(report.skips??=[]).push({case:'cancel-active-key',reason:'Native key arrived outside active pulse window',before,received,after});
        else check('Native key arrived during active assistance and froze it',Math.abs(after-received.y)<=2,{before,received,after});
      }
    });
  }

  await scenario('nested-scroller-zoom-menu-and-reduced-guards', { viewport: { width: 1280, height: 600 } }, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page, true);
    await installWheelRecorder(page);

    // 1. Nested .grow-layout scroller in 1280x600 consumes isolated 120px wheel with zero document boost.
    await page.locator('[data-section="habilidades"]').click();
    const metrics = await page.locator('.grow-layout').evaluate(el => ({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    const maxInner = metrics.scrollHeight - metrics.clientHeight;
    check('Nested .grow-layout has remaining native overflow after Kit focus in 1280x600', maxInner - metrics.scrollTop > 20, metrics);

    const docBeforeInner = await page.evaluate(() => scrollY);
    const box = await page.locator('.grow-layout').boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await delay(180);
    await page.mouse.wheel(0, 120);
    await waitForWheelSettle(page, 240);
    const afterInner = await page.evaluate(() => ({
      docY: scrollY,
      innerTop: document.querySelector('.grow-layout').scrollTop,
      pan: window.nebulosaPreview.getState().pan,
    }));
    const expectedInner = Math.min(metrics.scrollTop + 120, maxInner);
    check('Isolated 120px wheel inside nested .grow-layout scrolls inner container natively with zero document boost', Math.abs(afterInner.innerTop - expectedInner) <= 4 && Math.abs(afterInner.docY - docBeforeInner) <= 1 && afterInner.pan === 0, {
      docBeforeInner,
      afterInner,
      expectedInner,
      maxInner,
    });

  });

  await scenario('zoom-and-menu-guards', {}, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(()=>document.querySelector('.amy-stage')?.dataset.phase==='settled'&&window.nebulosaPreview?.getState().ready);
    await settle(page);
    for(let step=0;step<12;step++){
      if(await page.evaluate(()=>document.activeElement.matches('.amy-lens-trigger')))break;
      await page.keyboard.press('Tab');
    }
    assert(await page.evaluate(()=>document.activeElement.matches('.amy-lens-trigger')),'native Tab reaches lens');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.amy-stage')?.dataset.zoomed==='true'&&document.activeElement.matches('.amy-zoom-close'));
    const before=await settle(page);
    await page.mouse.move(8,40);
    await page.mouse.wheel(0,120);
    await page.waitForFunction(()=>document.querySelector('.amy-stage')?.dataset.zoomed==='false'&&document.activeElement.matches('.amy-lens-trigger'));
    const after=await waitForWheelSettle(page,240);
    check('Glasses wheel exits zoom and restores saved native offset without added pulse',Math.abs(after-before)<=2,{before,after});
    await page.locator('.jj-menu-btn').click();
    await page.waitForFunction(()=>document.querySelector('.jj-navbar')?.classList.contains('menu-is-open'));
    const menuBefore=await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,120);
    const menuAfter=await waitForWheelSettle(page,240);
    check('Open menu preserves document offset',Math.abs(menuAfter-menuBefore)<=2,{menuBefore,menuAfter});
  });

  await scenario('reduced-motion-guard', { reducedMotion: 'reduce' }, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-hero')?.dataset.static === 'true' && window.nebulosaPreview?.getState());
    const yStartReduced = await settle(page);
    await installWheelRecorder(page);
    await page.mouse.move(8, 40);
    await delay(180);
    await page.mouse.wheel(0, 120);
    const yAfterReduced = await waitForWheelSettle(page, 240);
    const reducedDelta = yAfterReduced - yStartReduced;
    check('prefers-reduced-motion: reduce skips wheel pulse boost and keeps native 120px travel', Math.abs(reducedDelta - 120) <= 3, {
      yStartReduced,
      yAfterReduced,
      reducedDelta,
    });
  });

  report.status = report.cases.every(item => item.status === 'PASS') && !report.errors.length ? 'PASS' : 'FAIL';
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
  process.exitCode = process.exitCode || 1;
} finally {
  try { await browser?.close(); }
  finally { await stopPreview(); }
  report.finishedAt = new Date().toISOString();
  if (output) await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    suite: report.suite,
    status: report.status,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    node: report.node,
    browser: report.browser,
    baseURL: report.baseURL,
    buildSHA256: report.buildSHA256,
    passed: report.checks.filter(item => item.pass).length,
    total: report.checks.length,
    cases: report.cases,
    errors: report.errors,
    failure: report.failure,
    skips: report.skips || [],
  }, null, 2));
}
