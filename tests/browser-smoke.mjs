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
const report = { startedAt: new Date().toISOString(), node: process.version, checks: [], errors: [], expectedErrors: [], cases: [] };
const socialURLs = [
  'https://www.tiktok.com/@amyjgil', 'https://www.youtube.com/@AmyJGil',
  'https://www.twitch.tv/amyjgil', 'https://kick.com/amyjgil', 'https://starvios.com/amyjgil',
];
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
  // Refuse an existing listener; do not accidentally test or terminate its server.
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
    // Wait for this child's readiness before probing HTTP, including port races.
    if (previewLog.includes('Local:')) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok && preview.exitCode === null) return url;
      } catch { /* Readiness is bounded by the loop below. */ }
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
    if (stable >= 3) return;
    previous = y;
    await delay(120);
  }
  throw Error('Document scroll did not settle.');
}

async function wheelTo(page, readRemaining, predicate, maxSteps = 90) {
  for (let step = 0; step < maxSteps; step++) {
    if (await page.evaluate(predicate)) return;
    const remaining = await page.evaluate(readRemaining);
    const absRemaining = Math.abs(remaining);
    const stepSize = absRemaining >= 245
      ? Math.min(320, Math.round(absRemaining))
      : Math.min(60, Math.max(16, Math.round(absRemaining)));
    const delta = Math.sign(remaining) * stepSize;
    if (!delta) break;
    const previous = await page.evaluate(() => ({ y: scrollY, inner: document.querySelector('.grow-layout')?.scrollTop || 0 }));
    await page.mouse.wheel(0, delta);
    await page.waitForFunction(previous => Math.abs(scrollY - previous.y) > 0.1 ||
      Math.abs((document.querySelector('.grow-layout')?.scrollTop || 0) - previous.inner) > 0.1, previous);
  }
  await page.waitForFunction(predicate);
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
      y: scrollY, max: scroller.scrollHeight - scroller.clientHeight,
      opacity: Number(getComputedStyle(about).opacity), overflow: scroller.scrollWidth - innerWidth,
      focused: document.activeElement.matches('.setup-construction'),
      focusSafe: !document.activeElement.closest('[inert]'),
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

async function hiddenFallback(page) {
  check('Fallback stays hidden and inert outside a failed portrait', await page.locator('.nebulosa-fallback').evaluate(el => el.hidden && el.inert));
}

async function scenario(name, options, run, disabledWebGL = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  const errorsBefore = report.errors.length;
  function record(type, message) {
    const expected = disabledWebGL && type === 'console' && (
      /^(?:THREE\.WebGLRenderer: ){1,2}Error creating WebGL context\.$/.test(message) ||
      /^No se ha podido iniciar la recomposición\. Error: (?:THREE\.WebGLRenderer: )?Error creating WebGL context\.(?:\n|$)/u.test(message) ||
      message === 'Error creating WebGL context.'
    );
    report[expected ? 'expectedErrors' : 'errors'].push({ case: name, type, message });
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
        url: location.href, y: scrollY, active: document.activeElement?.outerHTML.slice(0, 500),
        scene: window.nebulosaPreview?.getState().phase,
        pan: window.nebulosaPreview?.getState().pan,
        portalInert: document.querySelector('.grow-portal-frame')?.inert,
        fallbackHidden: document.querySelector('.nebulosa-fallback')?.hidden,
      }));
      if (output) await page.screenshot({ path: path.join(output, `${name}-failure.png`) });
    } catch (diagnosticError) { failure.diagnosticError = diagnosticError.message; }
    report.cases.push(failure);
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function reachableLinks(page, context, selector) {
  const links = page.locator(selector);
  const destinations = await links.evaluateAll(items => items.map(el => el.href).sort());
  check('Five real social destinations are preserved', JSON.stringify(destinations) === JSON.stringify([...socialURLs].sort()), destinations);
  const intercepted = [];
  // This context is separate from cache tests; routing disables the HTTP cache.
  await context.route(url => socialURLs.includes(url.href), async route => {
    intercepted.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Social link test</title>' });
  });
  const seen = new Set();
  for (let step = 0; step < 25 && seen.size < 5; step++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(selector => {
      const el = document.activeElement;
      if (!el.matches(selector)) return null;
      const rect = el.getBoundingClientRect();
      return { href: el.href, visible: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && !el.closest('[inert]') };
    }, selector);
    if (!focused || seen.has(focused.href)) continue;
    // Native focus scrolls smoothly; page RAF polling is suspended with JS off.
    let visible = focused.visible;
    for (let attempt = 0; !visible && attempt < 30; attempt++) {
      await delay(100);
      visible = await page.evaluate(({ selector, href }) => {
        const el = document.activeElement, rect = el.getBoundingClientRect();
        return el.matches(selector) && el.href === href && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && !el.closest('[inert]');
      }, { selector, href: focused.href });
    }
    check('Social link is keyboard reachable and visible', visible, focused.href);
    const popupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    try { await popup.waitForURL(focused.href); }
    finally { await popup.close(); }
    seen.add(focused.href);
  }
  check('All five links activate natively with Enter', seen.size === 5 && new Set(intercepted).size === 5, [...seen]);
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
  // Hosted CI has no physical GPU; opt in only for its isolated test browser.
  const softwareWebGL = process.env.AMY_TEST_SOFTWARE_WEBGL === '1';
  browser = await chromium.launch({ headless: true,
    ...(softwareWebGL ? { args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] } : {}),
    ...(process.env.AMY_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.AMY_BROWSER_EXECUTABLE_PATH } : { channel: 'chrome' }) });
  report.softwareWebGL = softwareWebGL;
  report.browser = browser.version();

  await scenario('home-menu-agents', {}, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled');
    check('Cold Home exposes the glasses control', await page.locator('.amy-lens-trigger').isVisible());
    const y = await page.evaluate(() => scrollY);
    await page.locator('.amy-lens-trigger').click();
    await page.waitForFunction(() => document.querySelector('.amy-stage').dataset.zoomed === 'true' && document.activeElement.matches('.amy-zoom-close'));
    check('Glasses overlay is interactive', await page.locator('.amy-zoom-overlay').evaluate(el => !el.inert));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.amy-stage').dataset.zoomed === 'false' && document.activeElement.matches('.amy-lens-trigger'));
    check('Escape restores glasses focus and scroll', Math.abs((await page.evaluate(() => scrollY)) - y) <= 2);
    await menu(page, '#agents');
    await readyAgents(page, true);
    await hiddenFallback(page);
    for (const id of ['sage', 'gekko', 'brimstone', 'phoenix', 'chamber']) {
      if (id !== 'sage') await page.locator('.helix-arrow[aria-label="Agente siguiente"]').click();
      await page.waitForFunction(id => document.querySelector('[data-agent-card]')?.dataset.agentId === id, id);
      check(`${id}: archive, biography and role are present`, (await page.locator('[data-summary-bio]').innerText()).length > 50 && await page.locator('[data-role-icon-canvas]').count() === 1);
      for (const section of ['habilidades', 'consejos', 'perfil']) {
        const tab = page.locator(`[data-section="${section}"]`);
        await tab.click();
        check(`${id}: ${section} tab exposes its panel`, await tab.getAttribute('aria-selected') === 'true' && await page.locator(`[data-section-panel="${section}"]`).evaluate(el => !el.hidden));
      }
    }
    await page.locator('[data-section="perfil"]').focus();
    await page.keyboard.press('ArrowRight');
    check('Archive keyboard selects Kit and moves focus', await page.locator('[data-section="habilidades"]').evaluate(el => el === document.activeElement && el.getAttribute('aria-selected') === 'true'));
    await page.locator('[data-ability="C"]').focus();
    await page.keyboard.press('ArrowRight');
    check('Ability keyboard opens Q', await page.locator('[data-ability="Q"]').getAttribute('aria-expanded') === 'true');
    await menu(page, '#gear');
    await endpoint(page);
    await hiddenFallback(page);
  });

  await scenario('keyboard-selection', {}, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page);
    // Follow the visitor's full Tab path through the archive and its footer.
    // This also exercises focus scrolling inside the scene's nested viewport.
    let tabEnteredHero = false;
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => Boolean(document.activeElement?.closest('.amy-hero')))) tabEnteredHero = true;
      if (await page.evaluate(() => document.activeElement.matches('.helix-portrait'))) break;
    }
    check('Cold #agents Tab path skips covered Hero controls', !tabEnteredHero && await page.locator('.amy-stage').evaluate(el => el.inert));
    check('Native Tab reaches the selected portrait through the archive', await page.locator('.helix-portrait[aria-pressed="true"]').evaluate(el => el === document.activeElement));
    const beforeSelection = await page.evaluate(() => scrollY);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-agent-card]').dataset.agentId === 'gekko');
    check('Selecting after archive Tab keeps the document and scene stable', await page.evaluate(previous => Math.abs(scrollY - previous) <= 1 && document.querySelector('.grow-portal-frame').dataset.settled === 'true' && !document.querySelector('.grow-portal-frame').inert, beforeSelection));
    check('ArrowRight moves focus with the selected portrait', await page.locator('.helix-portrait[aria-pressed="true"]').evaluate(el => el === document.activeElement));
    check('Only the selected portrait is a Tab stop', await page.locator('.helix-portrait').evaluateAll(items => items.filter(el => el.tabIndex === 0).length === 1 && items.find(el => el.tabIndex === 0).getAttribute('aria-pressed') === 'true'));
    await page.keyboard.press('Tab');
    check('Tab leaves the portrait without changing selection', await page.locator('[data-agent-card]').getAttribute('data-agent-id') === 'gekko' && await page.locator('.helix-arrow[aria-label="Agente anterior"]').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Shift+Tab');
    check('Shift+Tab returns to the selected portrait', await page.locator('.helix-portrait[aria-pressed="true"]').evaluate(el => el === document.activeElement));
    for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight');
    check('Five rapid arrows wrap while retaining portrait focus', await page.locator('[data-agent-card]').getAttribute('data-agent-id') === 'gekko' && await page.locator('.helix-portrait[aria-pressed="true"]').evaluate(el => el === document.activeElement));
    await page.locator('.helix-arrow[aria-label="Agente siguiente"]').click();
    check('Next control keeps focus on the control', await page.locator('[data-agent-card]').getAttribute('data-agent-id') === 'brimstone' && await page.locator('.helix-arrow[aria-label="Agente siguiente"]').evaluate(el => el === document.activeElement));
  });

  await scenario('native-journey', {}, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page, true);
    const inner = await page.locator('.grow-layout').boundingBox();
    await page.mouse.move(inner.x + inner.width * 0.96, Math.min(800, Math.max(100, inner.y + inner.height * 0.5)));
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = await page.locator('.grow-layout').evaluate(el => ({ top: el.scrollTop, atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 }));
      if (position.atEnd) break;
      await page.mouse.wheel(0, 600);
      await page.waitForFunction(old => document.querySelector('.grow-layout').scrollTop > old, position.top);
    }
    check('Native wheel reaches inner boundary before scene exit', await page.locator('.grow-layout').evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1) && await page.evaluate(() => window.nebulosaPreview.getState().pan === 0));
    async function arriveAmy() {
      await page.mouse.move(8, 450);
      await wheelTo(
        page,
        () => {
          const s = window.nebulosaPreview.getState();
          return (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2 - scrollY;
        },
        () => {
          const s = window.nebulosaPreview?.getState();
          return s?.phase === 'hold' && s.pan === 1 && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5;
        },
      );
      await settle(page);
    }
    await arriveAmy();
    check('Native forward reaches AMY and all five social links', await page.locator('a.nebulosa-social[data-link-active="true"]').count() === 5);
    await hiddenFallback(page);
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.flowHoldStart + s.flowHoldEnd) / 2 - scrollY;
      },
      () => {
        const s = window.nebulosaPreview?.getState();
        const portal = document.querySelector('.grow-portal-frame');
        return s?.phase === 'flowHold' && s.pan === 0 && Boolean(portal && !portal.inert && portal.dataset.settled === 'true');
      },
    );
    await settle(page);
    check('Native reverse restores the helix physical stop', await page.evaluate(() => {
      const s = window.nebulosaPreview.getState();
      const portal = document.querySelector('.grow-portal-frame');
      return scrollY >= s.flowHoldStart - 2 && scrollY <= s.flowHoldEnd + 2 && s.pan === 0 && !portal.inert && portal.dataset.settled === 'true';
    }));
    await arriveAmy();
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return s.start + s.span - scrollY;
      },
      () => window.nebulosaPreview?.getState().closingProgress === 1 && !document.querySelector('.amy-about').inert,
    );
    await endpoint(page, false);
    await page.keyboard.press('End');
    await endpoint(page, false);
    await menu(page, '#gear');
    await endpoint(page);
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2 - scrollY;
      },
      () => window.nebulosaPreview?.getState().phase === 'hold'
        && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5,
    );
    await settle(page);
    check('Reverse from focused setup restores active social links', await page.locator('a.nebulosa-social[data-link-active="true"]').count() === 5);
  });

  for (const [name, options] of [
    ['mobile-endpoint', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ['reduced-endpoint', { reducedMotion: 'reduce' }],
  ]) await scenario(name, options, async page => {
    await page.goto(`${baseURL}#gear`);
    await endpoint(page);
    await hiddenFallback(page);
    await menu(page, '#agents');
    await readyAgents(page);
    await page.locator('[data-section="consejos"]').click();
    check(`${name}: archive remains usable`, await page.locator('[data-section="consejos"]').getAttribute('aria-selected') === 'true');
    await menu(page, '#gear');
    await endpoint(page);
  });

  await scenario('resize-scenes', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async page => {
    await page.goto(`${baseURL}#agents`);
    await readyAgents(page);
    await page.locator('.helix-arrow[aria-label="Agente siguiente"]').click();
    const selected = await page.locator('[data-agent-card]').getAttribute('data-agent-id');
    for (const [width, height] of [[844, 390], [390, 844], [390, 760]]) {
      await page.setViewportSize({ width, height });
      await readyAgents(page);
      check(`Resize ${width}x${height} preserves interactive agents and selection`, await page.evaluate(id => {
        const state = window.nebulosaPreview.getState();
        return state.pan === 0 && !document.querySelector('.grow-portal-frame').closest('[inert]')
          && document.querySelector('[data-agent-card]').dataset.agentId === id
          && document.scrollingElement.scrollWidth <= innerWidth;
      }, selected));
    }
    await menu(page, '#gear');
    await endpoint(page);
    await page.mouse.move(8, 350);
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2 - scrollY;
      },
      () => window.nebulosaPreview?.getState().phase === 'hold'
        && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5,
    );
    for (const [width, height] of [[844, 390], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => window.nebulosaPreview.getState().phase === 'hold'
        && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5);
      await settle(page);
      check(`Resize ${width}x${height} preserves AMY and its social links`, await page.evaluate(() =>
        window.nebulosaPreview.getState().phase === 'hold'
        && document.querySelectorAll('a.nebulosa-social[data-link-active="true"]').length === 5
        && document.scrollingElement.scrollWidth <= innerWidth));
    }
  });

  await scenario('controlled-video-resize', {}, async page => {
    await page.goto(`${baseURL}#amy-home`);
    await page.waitForFunction(() => document.querySelector('.amy-stage')?.dataset.phase === 'settled');
    await settle(page);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.move(8, 450);
    await page.mouse.wheel(0, 60);
    await page.waitForFunction(y => scrollY > y + 40, before);
    // Fault injection isolates media resize; the visitor's scroll remains native.
    const injectedInFlight = await page.locator('video').evaluate(video => {
      const state = window.nebulosaPreview.getState();
      const target = state.start + state.layout.distances.flowHold[1] * innerHeight - 2;
      const moving = scrollY < target - 40;
      video.dispatchEvent(new Event('resize', { bubbles: false }));
      return moving;
    });
    check('Controlled media resize occurs before the native move completes', injectedInFlight);
    await wheelTo(
      page,
      () => {
        const state = window.nebulosaPreview.getState();
        return (state.flowHoldStart + state.flowHoldEnd) / 2 - scrollY;
      },
      () => {
        const state = window.nebulosaPreview?.getState();
        return Boolean(state && scrollY >= state.flowHoldStart && scrollY <= state.flowHoldEnd && state.pan === 0);
      },
    );
    await readyAgents(page);
    check('Controlled media resize does not interrupt native scene arrival', await page.evaluate(() => {
      const state = window.nebulosaPreview.getState();
      return scrollY >= state.flowHoldStart - 2 && scrollY <= state.flowHoldEnd + 2 && state.pan === 0 && !document.querySelector('.grow-portal-frame').inert;
    }));
  });

  await scenario('cold-focus-user-intent', {}, async (page, context) => {
    let release, heldRequest = false;
    const imageGate = new Promise(resolve => { release = resolve; });
    await context.route('**/assets/images/amy/amy-cutout.webp', async route => {
      heldRequest = true;
      await imageGate;
      await route.continue();
    });
    // React may mount after load in Chromium/WebKit. A static fixture image
    // guarantees the same pre-load window without changing application code.
    await context.route(baseURL.href, async route => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({ response, body: html.replace('<body>', '<body><img hidden src="assets/images/amy/amy-cutout.webp" alt="">') });
    });
    try {
      await page.goto(`${baseURL}#gear`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.nebulosaPreview?.getState().closingProgress === 1);
      check('Focus fixture holds document load after React mounts', heldRequest
        && await page.evaluate(() => document.readyState !== 'complete'));
      await page.keyboard.press('Tab');
      release();
      await page.waitForLoadState('load');
      await settle(page);
      check('Cold entry respects keyboard intent before document load', await page.evaluate(() =>
        !document.activeElement.matches('.setup-construction') && !document.activeElement.closest('[inert]')));
    } finally { release(); }
  });

  await scenario('cache-policy', {}, async (page, context) => {
    await context.addInitScript(() => {
      window.__amyFetchPolicy = [];
      const original = window.fetch;
      window.fetch = function (input, options) {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        if (/\/(?:depth|hair-weight)[^/]*\.(?:f32|json)$/.test(url.pathname)) {
          window.__amyFetchPolicy.push({ asset: url.pathname.split('/').pop(), cache: options?.cache ?? (input instanceof Request ? input.cache : 'default') });
        }
        return original.apply(this, arguments);
      };
    });
    for (const cold of [true, false]) {
      if (cold) await page.goto(`${baseURL}#agents`);
      else await page.reload();
      await readyAgents(page, true);
      const policies = await page.evaluate(() => window.__amyFetchPolicy);
      check(`${cold ? 'Cold' : 'Warm'} asset fetches retain default HTTP caching`, new Set(policies.map(item => item.asset)).size === 3 && policies.every(item => item.cache === 'default'), policies);
    }
    report.cacheTiming = await page.evaluate(() => performance.getEntriesByType('resource').filter(item => /\/(?:depth|hair-weight)[^/]*\.(?:f32|json)$/.test(new URL(item.name).pathname)).map(item => ({ asset: new URL(item.name).pathname.split('/').pop(), transferSize: item.transferSize, encodedBodySize: item.encodedBodySize })));
  });

  await scenario('no-javascript', { javaScriptEnabled: false, viewport: { width: 320, height: 600 } }, async (page, context) => {
    await page.goto(baseURL.href);
    check('Body noscript main is visible without horizontal overflow at 320px', await page.locator('body noscript main').isVisible() && await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth));
    await reachableLinks(page, context, 'body noscript main nav a[href]');
  });

  await scenario('disabled-webgl', {}, async (page, context) => {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      window.__amyBlockedWebgl = 0;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) { window.__amyBlockedWebgl++; return null; }
        return original.call(this, type, ...args);
      };
    });
    await page.goto(`${baseURL}#gear`);
    await endpoint(page);
    await page.mouse.move(8, 450);
    await wheelTo(
      page,
      () => {
        const s = window.nebulosaPreview.getState();
        return (s.nebulosaHoldStart + s.nebulosaHoldEnd) / 2 - scrollY;
      },
      () => {
        const el = document.querySelector('.nebulosa-fallback');
        return Boolean(el && !el.hidden && !el.inert);
      },
    );
    check('Unavailable WebGL exposes a readable fallback', await page.evaluate(() => window.__amyBlockedWebgl > 0) && await page.locator('.nebulosa-fallback').isVisible());
    await reachableLinks(page, context, '.nebulosa-fallback a[data-fallback-social]');
    check('Fallback retry remains available', await page.locator('.nebulosa-fallback button').isEnabled());
    await menu(page, '#gear');
    await endpoint(page);
    await hiddenFallback(page);
    check('Only the disabled WebGL case records expected startup failures', report.expectedErrors.length > 0);
  }, true);

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
    status: report.status, startedAt: report.startedAt, finishedAt: report.finishedAt,
    node: report.node, browser: report.browser, baseURL: report.baseURL, buildSHA256: report.buildSHA256,
    passed: report.checks.filter(item => item.pass).length, total: report.checks.length,
    cases: report.cases, errors: report.errors, expectedErrors: report.expectedErrors,
    cacheTiming: report.cacheTiming, failure: report.failure,
  }, null, 2));
}
