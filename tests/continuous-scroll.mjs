import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { chromium } from 'playwright-core';

assert(Number(process.versions.node.split('.')[0]) >= 22, 'Use Node 22 or newer.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.AMY_TEST_OUTPUT && path.resolve(process.env.AMY_TEST_OUTPUT);
const report = {
  suite: 'continuous-scroll',
  startedAt: new Date().toISOString(),
  node: process.version,
  checks: [],
  errors: [],
  cases: [],
};

let browser, preview, previewFailure, previewLog = '', interrupted = false;
let baseURL;

function check(name, pass, detail) {
  report.checks.push({ name, pass: Boolean(pass), detail });
  assert(pass, `${name}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`);
  console.log(`PASS ${name}`);
}

async function startPreview() {
  await access(path.join(root, 'dist/index.html'));
  const port = Number(process.env.AMY_TEST_PORT || 4173);
  assert(Number.isInteger(port) && port > 0 && port <= 65535, 'AMY_TEST_PORT must be a valid TCP port.');
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  preview = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--base', '/AMY-v2.0/',
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  preview.on('error', error => { previewFailure = error; });
  for (const stream of [preview.stdout, preview.stderr]) {
    stream.on('data', chunk => { previewLog = stripVTControlCharacters(previewLog + chunk.toString()).slice(-6000); });
  }
  const url = `http://127.0.0.1:${port}/AMY-v2.0/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (interrupted) throw Error('Run interrupted.');
    if (previewFailure || preview.exitCode !== null) throw Error(`Preview failed: ${previewFailure || previewLog}`);
    if (previewLog.includes('Local:')) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok && preview.exitCode === null) return url;
      } catch { /* Bounded by readiness loop. */ }
    }
    await delay(100);
  }
  throw Error(`Preview did not become ready: ${previewLog}`);
}

async function stopPreview() {
  if (!preview || preview.exitCode !== null || preview.signalCode !== null) return;
  const exited = once(preview, 'exit');
  preview.kill('SIGTERM');
  let timer;
  try {
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(timer); }
  if (preview.exitCode === null && preview.signalCode === null) {
    preview.kill('SIGKILL');
    await exited;
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  void browser?.close();
  preview?.kill('SIGTERM');
});

async function settle(page) {
  let previous = -1, stable = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const y = await page.evaluate(() => scrollY);
    stable = Math.abs(y - previous) < 0.1 ? stable + 1 : 0;
    if (stable >= 3) return y;
    previous = y;
    await delay(80);
  }
  throw Error('Document scroll did not settle.');
}

async function wheelTo(page, readRemaining, predicate, maxSteps = 90, intervalMs = 24) {
  const samples = [];
  for (let step = 0; step < maxSteps; step++) {
    if (await page.evaluate(predicate)) return samples;
    const remaining = await page.evaluate(readRemaining);
    const absRemaining = Math.abs(remaining);
    const stepSize = absRemaining >= 245
      ? Math.min(300, Math.round(absRemaining))
      : Math.min(60, Math.max(16, Math.round(absRemaining)));
    const delta = Math.sign(remaining) * stepSize;
    if (!delta) break;
    const previous = await page.evaluate(() => ({ y: scrollY, inner: document.querySelector('.grow-layout')?.scrollTop || 0 }));
    await page.mouse.wheel(0, delta);
    await page.waitForFunction(previous => Math.abs(scrollY - previous.y) > 0.1 ||
      Math.abs((document.querySelector('.grow-layout')?.scrollTop || 0) - previous.inner) > 0.1, previous);
    await delay(intervalMs);
    samples.push(await page.evaluate(() => scrollY));
  }
  await page.waitForFunction(predicate);
  return samples;
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

async function endpoint(page, requireFocus = true) {
  await page.waitForFunction(() => window.nebulosaPreview?.getState().closingProgress === 1 && !document.querySelector('.amy-about').inert);
  await settle(page);
  const geometry = await page.evaluate(() => {
    const scroller = document.scrollingElement, about = document.querySelector('.amy-about');
    return {
      y: scrollY,
      max: scroller.scrollHeight - scroller.clientHeight,
      opacity: Number(getComputedStyle(about).opacity),
      overflow: scroller.scrollWidth - innerWidth,
      focused: document.activeElement.matches('.setup-construction'),
      focusSafe: !document.activeElement.closest('[inert]') && !document.activeElement.closest('[aria-hidden="true"]'),
      tail: document.querySelectorAll('#stats,#shorts,#sensCanvas,.setup-gear,.footer-hud').length,
      missingAnchors: [...document.querySelectorAll('a[href^="#"]')].map(a => a.hash).filter(hash => hash.length > 1 && !document.getElementById(hash.slice(1))),
    };
  });
  check('Setup is the usable physical endpoint', Math.abs(geometry.y - geometry.max) <= 1 && geometry.opacity === 1 && geometry.overflow <= 0 && geometry.focusSafe && (!requireFocus || geometry.focused) && !geometry.tail && !geometry.missingAnchors.length, geometry);
}

async function menu(page, fragment) {
  await page.locator('.jj-menu-btn').click();
  await page.locator(`.jj-nav-link[href="${fragment}"]`).click();
}

async function cdpSwipe(client, page, { x = 195, startY = 640, endY = 200, steps = 10, stepDelayMs = 16 } = {}) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    const y = Math.round(startY + (endY - startY) * (i / steps));
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
    });
    await delay(stepDelayMs);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await settle(page);
}

async function scenario(name, options, run) {
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
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === baseURL.origin && !url.pathname.startsWith(baseURL.pathname)) record('prefix', `Escaped deployment prefix: ${url.pathname}`);
  });
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
        active: document.activeElement?.outerHTML.slice(0, 500),
        scene: window.nebulosaPreview?.getState().phase,
        pan: window.nebulosaPreview?.getState().pan,
        portalInert: document.querySelector('.grow-portal-frame')?.inert,
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

  await scenario('continuous-wheel-and-stops', {}, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled' && window.nebulosaPreview?.getState());
    await settle(page);

    check('Narrative scroll hook is not mounted on App', await page.evaluate(() => window.amyScrollReview === undefined));

    const initial = await page.evaluate(() => {
      const hero = document.querySelector('.amy-hero');
      const stage = hero.querySelector('.amy-stage');
      const css = getComputedStyle(hero);
      const dwell = Number(css.getPropertyValue('--hero-dwell')) || 0.15;
      const travel = stage.offsetHeight * Number(css.getPropertyValue('--hero-transition'));
      const heroTop = scrollY + hero.getBoundingClientRect().top;
      const s = window.nebulosaPreview.getState();
      return {
        y: scrollY,
        formerHeroStop: heroTop + travel + stage.offsetHeight * dwell - 2,
        formerHelixStop: s.flowHoldEnd - 2,
        formerAmyStop: s.nebulosaHoldEnd - 2,
        start: s.start,
        flowHoldEnd: s.flowHoldEnd,
        nebulosaHoldStart: s.nebulosaHoldStart,
        nebulosaHoldEnd: s.nebulosaHoldEnd,
      };
    });

    await page.mouse.move(8, 450);
    await page.mouse.wheel(0, 50);
    const afterSmallWheel = await settle(page);
    await delay(350);
    const afterQuietWait = await page.evaluate(() => scrollY);

    check('One small wheel does not auto-travel to a screen', Math.abs((afterSmallWheel - initial.y) - 50) <= 2 && afterSmallWheel < initial.formerHeroStop - 60 && afterSmallWheel < initial.formerHelixStop - 1000, {
      initialY: initial.y,
      afterSmallWheel,
      formerHeroStop: initial.formerHeroStop,
      formerHelixStop: initial.formerHelixStop,
    });
    check('Wheel stopped means no scripted destination travel', Math.abs(afterQuietWait - afterSmallWheel) <= 1, {
      afterSmallWheel,
      afterQuietWait,
    });

    await page.locator('.amy-lens-trigger').focus();
    check('Hero lens trigger can be focused while wipe is zero', await page.evaluate(() => document.activeElement?.matches('.amy-lens-trigger') && !document.querySelector('.amy-stage').inert));

    // Continuous wheel stream with 20ms cadence (< 180ms old quiet gate) crosses both
    // former Hero stop and former Helix stop without releasing or pausing.
    const samples = [afterSmallWheel];
    for (let step = 0; step < 48; step++) {
      const currentY = await page.evaluate(() => scrollY);
      if (currentY > initial.flowHoldEnd + 280) break;
      await page.mouse.wheel(0, 60);
      await delay(20);
      samples.push(await page.evaluate(() => scrollY));
    }
    const midStreamStop = await settle(page);
    check('Entering nonzero Hero wipe blurs focused Hero control and marks stage inert', await page.evaluate(() => {
      const stage = document.querySelector('.amy-stage');
      return stage.dataset.wipe !== '0.0000' && stage.inert && !stage.contains(document.activeElement);
    }));
    await delay(300);
    const midStreamAfterWait = await page.evaluate(() => scrollY);
    const monotonicForward = samples.every((y, i) => i === 0 || y >= samples[i - 1]);

    check('Continuing wheel crosses former Hero and Helix stops without releasing', monotonicForward
      && samples.some(y => y < initial.formerHeroStop)
      && samples.some(y => y > initial.formerHeroStop && y < initial.formerHelixStop)
      && midStreamStop > initial.formerHelixStop + 250, {
      firstSample: samples[0],
      lastSample: samples.at(-1),
      midStreamStop,
      formerHeroStop: initial.formerHeroStop,
      formerHelixStop: initial.formerHelixStop,
    });
    check('Stopping mid-bridge halts immediately without snapping to a stop', Math.abs(midStreamAfterWait - midStreamStop) <= 1 && midStreamStop > initial.flowHoldEnd + 200 && midStreamStop < initial.nebulosaHoldStart - 200, {
      midStreamStop,
      midStreamAfterWait,
    });

    // Reverse wheel follows input proportionally and restores interactive Helix when entering flowHold.
    await page.mouse.wheel(0, -60);
    const afterSmallReverse = await settle(page);
    await delay(280);
    const afterSmallReverseWait = await page.evaluate(() => scrollY);
    check('Small reverse wheel moves proportionally without auto-traveling to previous stop', Math.abs((midStreamStop - afterSmallReverse) - 60) <= 2 && Math.abs(afterSmallReverseWait - afterSmallReverse) <= 1 && afterSmallReverse > initial.flowHoldEnd + 100, {
      midStreamStop,
      afterSmallReverse,
      afterSmallReverseWait,
    });

    const reverseSamples = await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.flowHoldStart + s.flowHoldEnd) / 2 - scrollY;
      },
      () => {
        const s = window.nebulosaPreview?.getState();
        const portal = document.querySelector('.grow-portal-frame');
        return Boolean(s && s.phase === 'flowHold' && s.pan === 0 && portal && !portal.inert && portal.dataset.settled === 'true');
      },
      60,
      20,
    );
    await readyAgents(page, true);
    const monotonicReverse = reverseSamples.every((y, i) => i === 0 || y <= reverseSamples[i - 1]);
    check('Reverse wheel stream follows input and restores interactive Helix', monotonicReverse && await page.evaluate(() => {
      const s = window.nebulosaPreview.getState();
      const portal = document.querySelector('.grow-portal-frame');
      return scrollY >= s.flowHoldStart - 2 && scrollY <= s.flowHoldEnd + 2 && s.pan === 0 && !portal.inert && portal.dataset.settled === 'true';
    }), { steps: reverseSamples.length, finalY: reverseSamples.at(-1) });
  });

  await scenario('social-hover-and-focus-pagedown', {}, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page, true);
    await page.mouse.move(8, 450);

    // Wheel into the first third of AMY hold where all 5 social links are active.
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return s.nebulosaHoldStart + (s.nebulosaHoldEnd - s.nebulosaHoldStart) * 0.25 - scrollY;
      },
      () => {
        const s = window.nebulosaPreview?.getState();
        const span = s ? s.nebulosaHoldEnd - s.nebulosaHoldStart : 0;
        return Boolean(s && s.phase === 'hold' && s.pan === 1
          && scrollY >= s.nebulosaHoldStart + span * 0.15 && scrollY <= s.nebulosaHoldStart + span * 0.45
          && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5);
      },
    );
    const holdStartY = await settle(page);

    // Hover an active social link and verify hover state does not block forward wheel.
    const socialLink = page.locator('a.nebulosa-social[data-link-active="true"]').first();
    const box = await socialLink.boundingBox();
    assert(box && box.width > 0 && box.height > 0, 'Active social link must have a visible bounding box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => Boolean(window.nebulosaPreview?.getState().socialHold));
    const hoveredId = await page.evaluate(() => window.nebulosaPreview.getState().socialHold);
    check('Hovering an active social link registers socialHold state', Boolean(hoveredId), hoveredId);

    await page.mouse.wheel(0, 60);
    const afterHoveredWheel = await settle(page);
    check('Social hover does not block forward wheel scroll', Math.abs((afterHoveredWheel - holdStartY) - 60) <= 3, {
      holdStartY,
      afterHoveredWheel,
      hoveredId,
    });

    // Continue wheeling forward while pointer remains over the social link position, crossing former AMY stop into recompose.
    for (let step = 0; step < 5; step++) {
      await page.mouse.wheel(0, 250);
      await delay(20);
    }
    const inRecompose = await page.evaluate(() => {
      const s = window.nebulosaPreview.getState();
      return { y: scrollY, phase: s.phase, closingProgress: s.closingProgress, nebulosaHoldEnd: s.nebulosaHoldEnd };
    });
    check('Continuing wheel while hovering social crosses former AMY stop into recompose', inRecompose.y > inRecompose.nebulosaHoldEnd + 100 && inRecompose.closingProgress > 0, inRecompose);

    // Return to AMY hold to test focused social PageDown and Escape.
    await page.mouse.move(8, 450);
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2 - scrollY;
      },
      () => {
        const s = window.nebulosaPreview?.getState();
        return Boolean(s && s.phase === 'hold' && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5);
      },
    );
    await settle(page);

    // Focus an active social link via Tab and verify Escape releases focus cleanly.
    await page.locator('a.nebulosa-social[data-link-active="true"]').first().focus();
    await page.keyboard.press('Tab');
    check('Keyboard focus reaches an active social link', await page.evaluate(() =>
      document.activeElement?.matches('a.nebulosa-social[data-link-active="true"]') && !document.activeElement.closest('[inert]')));
    await page.keyboard.press('Escape');
    check('Escape blurs focused social link', await page.evaluate(() => !document.activeElement?.matches('a.nebulosa-social')));

    // Re-focus active social link via keyboard Tab and press PageDown to progress through and past AMY hold.
    await page.locator('a.nebulosa-social[data-link-active="true"]').first().focus();
    await page.keyboard.press('Tab');
    const beforePageDown = await page.evaluate(() => ({
      y: scrollY,
      focusedSocial: document.activeElement?.getAttribute('data-social'),
      holdEnd: window.nebulosaPreview.getState().nebulosaHoldEnd,
    }));
    check('Social link is focused before PageDown', Boolean(beforePageDown.focusedSocial), beforePageDown);

    await page.keyboard.press('PageDown');
    const afterFirstPageDown = await settle(page);
    check('Focused social PageDown advances document scroll', afterFirstPageDown > beforePageDown.y + 200, {
      beforeY: beforePageDown.y,
      afterFirstPageDown,
    });

    for (let step = 0; step < 8; step++) {
      const reachedEnd = await page.evaluate(() => window.nebulosaPreview?.getState().closingProgress === 1);
      if (reachedEnd) break;
      await page.keyboard.press('PageDown');
      await settle(page);
    }
    const pageDownEnd = await page.evaluate(() => ({
      y: scrollY,
      closingProgress: window.nebulosaPreview.getState().closingProgress,
      aboutInert: document.querySelector('.amy-about').inert,
      activeTag: document.activeElement?.tagName,
      focusInert: Boolean(document.activeElement?.closest('[inert]')),
      focusAriaHidden: Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
    }));
    check('Focused social PageDown progresses accessibly to Setup without inert focus trap', pageDownEnd.closingProgress === 1 && !pageDownEnd.aboutInert && !pageDownEnd.focusInert && !pageDownEnd.focusAriaHidden, pageDownEnd);
  });

  await scenario('nested-inner-scroll-and-deep-links', { viewport: { width: 1280, height: 600 } }, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page, true);

    let tabVisitedHero = false;
    let tabReachedScene = false;
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => ({
        inHero: Boolean(document.activeElement?.closest('.amy-hero')),
        inScene: Boolean(document.activeElement?.closest('.grow-portal-frame')),
      }));
      if (state.inHero) tabVisitedHero = true;
      if (state.inScene) { tabReachedScene = true; break; }
    }
    check('Cold #agents Tab from navbar skips covered Hero and enters active scene', !tabVisitedHero && tabReachedScene && await page.locator('.amy-stage').evaluate(el => el.inert));

    // Expand Kit in a short 600px viewport so .grow-layout has real vertical overflow.
    await page.locator('[data-section="habilidades"]').click();
    const scrollerMetrics = await page.locator('.grow-layout').evaluate(el => ({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    check('Nested .grow-layout has scrollable overflow in short viewport', scrollerMetrics.scrollHeight - scrollerMetrics.clientHeight - scrollerMetrics.scrollTop > 20, scrollerMetrics);

    const docBeforeInner = await page.evaluate(() => scrollY);
    const box = await page.locator('.grow-layout').boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.wheel(0, Math.min(60, scrollerMetrics.scrollHeight - scrollerMetrics.clientHeight - scrollerMetrics.scrollTop - 5));
    await page.waitForFunction(before => document.querySelector('.grow-layout').scrollTop > before, scrollerMetrics.scrollTop);
    const duringInner = await page.evaluate(() => ({
      docY: scrollY,
      innerTop: document.querySelector('.grow-layout').scrollTop,
      pan: window.nebulosaPreview.getState().pan,
    }));
    check('Wheel inside nested scroller moves inner scrollTop without exiting scene', duringInner.innerTop > scrollerMetrics.scrollTop && Math.abs(duringInner.docY - docBeforeInner) <= 1 && duringInner.pan === 0, duringInner);

    for (let step = 0; step < 10; step++) {
      const atEnd = await page.locator('.grow-layout').evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
      if (atEnd) break;
      await page.mouse.wheel(0, 240);
      await delay(30);
    }
    check('Nested scroller reaches bottom boundary cleanly', await page.locator('.grow-layout').evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1));

    await menu(page, '#gear');
    await endpoint(page);
    await menu(page, '#amy-home');
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled');
    await settle(page);
    check('Menu #amy-home lands on settled Hero', await page.evaluate(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled' && !document.querySelector('.amy-lens-trigger').inert));
    await menu(page, '#agents');
    await readyAgents(page);
  });

  await scenario('native-mobile-swipe-cdp', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page, context) => {
    const client = await context.newCDPSession(page);
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled' && window.nebulosaPreview?.getState());
    const startY = await settle(page);

    // One short touch swipe moves proportionally and does not auto-travel to the next screen.
    await cdpSwipe(client, page, { x: 195, startY: 540, endY: 420, steps: 8, stepDelayMs: 18 });
    const afterShortSwipe = await page.evaluate(() => scrollY);
    await delay(300);
    const afterShortSwipeWait = await page.evaluate(() => scrollY);
    const nextScreenStart = await page.evaluate(() => window.nebulosaPreview.getState().start);
    check('Short mobile CDP swipe advances scroll without auto-traveling to the next screen', afterShortSwipe > startY + 25 && afterShortSwipe < nextScreenStart - 600 && Math.abs(afterShortSwipeWait - afterShortSwipe) <= 2, {
      startY,
      afterShortSwipe,
      afterShortSwipeWait,
      nextScreenStart,
    });

    // Reverse mobile swipe moves scrollY upward following the finger.
    await cdpSwipe(client, page, { x: 195, startY: 320, endY: 500, steps: 8, stepDelayMs: 18 });
    const afterReverseSwipe = await page.evaluate(() => scrollY);
    check('Reverse mobile CDP swipe scrolls upward following touch input', afterReverseSwipe < afterShortSwipe - 25, {
      afterShortSwipe,
      afterReverseSwipe,
    });

    // Navigate to #gear via menu and verify reverse mobile CDP swipes from Setup reach AMY hold.
    await menu(page, '#gear');
    await endpoint(page);
    for (let swipe = 0; swipe < 18; swipe++) {
      const state = await page.evaluate(() => {
        const s = window.nebulosaPreview?.getState();
        const holdMid = (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2;
        return {
          inHold: s.phase === 'hold' && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5,
          distanceToHold: scrollY - holdMid,
        };
      });
      if (state.inHold) break;
      const span = Math.min(340, Math.max(90, Math.round(Math.abs(state.distanceToHold) * 0.7)));
      await cdpSwipe(client, page, {
        x: 195,
        startY: state.distanceToHold > 0 ? 280 : 580,
        endY: state.distanceToHold > 0 ? 280 + span : 580 - span,
        steps: 8,
        stepDelayMs: 14,
      });
    }
    check('Repeated reverse mobile CDP swipes from Setup reach AMY and activate all 5 social links', await page.evaluate(() =>
      window.nebulosaPreview?.getState().phase === 'hold'
      && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5
      && !document.activeElement?.closest('[inert]')));

    // Swipe forward from AMY back to Setup endpoint.
    for (let swipe = 0; swipe < 16; swipe++) {
      const atEnd = await page.evaluate(() => window.nebulosaPreview?.getState().closingProgress === 1 && !document.querySelector('.amy-about').inert);
      if (atEnd) break;
      await cdpSwipe(client, page, { x: 195, startY: 680, endY: 220, steps: 10, stepDelayMs: 14 });
    }
    await endpoint(page, false);
  });

  await scenario('reduced-motion-continuous-scroll', { reducedMotion: 'reduce' }, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-hero')?.dataset.static === 'true' && window.nebulosaPreview?.getState());
    await settle(page);
    await page.mouse.move(8, 450);
    await page.mouse.wheel(0, 90);
    const y1 = await settle(page);
    await delay(250);
    const y2 = await page.evaluate(() => scrollY);
    check('Reduced motion retains native proportional wheel scroll without auto-travel', Math.abs(y1 - 90) <= 2 && Math.abs(y2 - y1) <= 1, { y1, y2 });
    await menu(page, '#gear');
    await endpoint(page);
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
  }, null, 2));
}
