import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const url = process.env.AMY_STARTUP_URL || 'http://127.0.0.1:5173/';
const output = process.env.AMY_STARTUP_OUTPUT;
const report = { url, checks: [], cases: [], errors: [] };
const fontCSS = ['Antonio', 'Cinzel', 'Inter', 'Rajdhani', 'Qadone'].map(name =>
  `@font-face{font-family:${name};src:local(Arial);font-weight:100 900;}`).join('\n');
const browser = await chromium.launch({ headless: true,
  ...(process.env.AMY_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.AMY_BROWSER_EXECUTABLE_PATH } : { channel: 'chrome' }) });
async function completeVideo(page, filename) {
  const original = await readFile(new URL(`../public/assets/videos/${filename}`, import.meta.url));
  const actual = await page.locator('video.amy-lens-video').evaluate(async video => {
    const bytes = await window.__startupVideoBlobs.get(video.currentSrc).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { blob: video.currentSrc.startsWith('blob:'), size: bytes.byteLength,
      sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') };
  });
  check('selected video is complete and byte-identical in memory', actual.blob && actual.size === original.length &&
    actual.sha256 === createHash('sha256').update(original).digest('hex'), actual);
}
function check(name, condition, detail) {
  report.checks.push({ name, pass: Boolean(condition), detail });
  assert(condition, `${name}: ${JSON.stringify(detail)}`);
  console.log(`PASS ${name}`);
}
function latch() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
async function hold(page, glob, gate) {
  await page.route(glob, async route => {
    await gate.promise;
    await route.continue().catch(() => {}); // The page may have been closed by the case.
  });
}
async function start(page, suffix = '') {
  await page.goto(url + suffix, { waitUntil: 'domcontentloaded' });
  await page.locator('#main').waitFor();
}
async function entered(page, reason = 'ready') {
  await page.locator('.startup-cover').waitFor({ state: 'detached', timeout: 12000 });
  check(`entry ${reason}`, await page.locator('#main').getAttribute('data-startup') === reason);
  check('main and navbar unlocked', await page.evaluate(() => !document.querySelector('#main').inert && !document.querySelector('.jj-navbar').inert));
}
async function capture(page, name) {
  if (output) await page.screenshot({ path: `${output}/${name}.png` });
}
async function scenario(name, run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__startupVideoBlobs = new Map();
    const create = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      window.__startupVideoBlobs.set(url, blob);
      return url;
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: fontCSS }));
  report.cases.push(name);
  console.log(`CASE ${name}`);
  try { await run(page, context); check(`${name}: no JS errors`, errors.length === 0, errors); }
  finally { await context.close(); }
}
try {
  if (output) await mkdir(output, { recursive: true });
  await scenario('real resource gate, input, continuation and focus', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.waitForFunction(() => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '89');
    check('pending portrait does not become 100', await page.locator('[role=progressbar]').getAttribute('aria-valuenow') === '89');
    check('covered video is paused at zero', await page.locator('video.amy-lens-video').evaluate(v => v.paused && v.currentTime === 0));
    check('covered main and navbar inert', await page.evaluate(() => document.querySelector('#main').inert && document.querySelector('.jj-navbar').inert));
    const before = await page.evaluate(() => ({ y: scrollY, overflow: document.documentElement.style.overflow, height: document.querySelector('#main').getBoundingClientRect().height }));
    await page.mouse.wheel(0, 400);
    await page.keyboard.press('ArrowDown');
    check('cover consumes native scroll input without overflow lock', await page.evaluate(() => scrollY === 0 && document.documentElement.style.overflow === '' && document.body.style.overflow === ''));
    await capture(page, 'desktop-loading');
    await page.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ timeout: 4500 });
    await page.keyboard.press('Tab');
    check('Tab reaches continue', await page.getByRole('button', { name: 'Continuar', exact: true }).evaluate(b => document.activeElement === b));
    await page.keyboard.press('Enter');
    await entered(page, 'continue');
    check('focus returns to brand', await page.locator('.jj-brand-left').evaluate(a => document.activeElement === a));
    check('hero geometry preserved on release', await page.evaluate(before => Math.abs(document.querySelector('#main').getBoundingClientRect().height - before.height) < 1 && scrollY === before.y, before));
    portrait.release();
    await page.locator('.amy-portrait').evaluate(img => img.decode());
    check('late ready never reopens cover', await page.locator('.startup-cover').count() === 0);
    await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
    await page.getByRole('button', { name: 'Cerrar menú de navegación' }).click();
    check('menu restores unlocked main', await page.locator('#main').evaluate(e => !e.inert));
  });
  await scenario('ready reveal and exact selected square grid', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    check('four squares with original dimensions and timing', await page.locator('.startup-cover__squares').evaluate(e => {
      const styles = [...e.children].map(x => getComputedStyle(x));
      return styles.length === 4 && styles.every(s => s.width === '28px' && s.height === '28px' && s.animationDuration === '1.2s');
    }));
    const releasedAt = Date.now();
    portrait.release();
    await entered(page);
    check('ready entry uses only the remaining two-second minimum and dissolve', Date.now() - releasedAt < 2500);
    check('all particle scenes prepared before entry', await page.evaluate(() =>
      window.amyReview.getStats().startup.prepared && window.amyReview.getStats().startup.warmedObjects > 0 &&
      window.nebulosaPreview.getState().recomposition.prepared &&
      document.querySelector('[data-role-icon]').dataset.roleCacheSize === '4' &&
      document.querySelector('[data-ambient-canvas]').dataset.bgReady === 'true' &&
      [...document.querySelectorAll('.helix-portrait img')].every(img => img.complete && img.naturalWidth > 0)));
    const time = await page.evaluate(() => window.amyReview.getStats().motion.time);
    await page.waitForTimeout(350);
    check('prepared hidden scenes remain paused without draws', await page.evaluate(time => {
      const engine = window.amyReview.getStats(), recomp = window.nebulosaPreview.getState().recomposition;
      return engine.motion.time === time && engine.motion.paused && engine.renderCalls === 0 &&
        recomp.progress === 0 && !recomp.visible && recomp.render.calls === 0 &&
        !document.querySelector('[data-ambient-canvas]').__backgroundState.active;
    }, time));
    check('loaded data can play after reveal', await page.locator('video.amy-lens-video').evaluate(v => v.readyState >= 2));
    await completeVideo(page, 'valorant-gameplay-720p-av1.webm');
    await capture(page, 'desktop-entered');
  });
  await scenario('portrait and video fallback remain pending until alternatives', async page => {
    const png = latch(), h264 = latch();
    await page.route('**/amy-cutout.webp', route => route.abort());
    await page.route('**/*-av1.webm', route => route.abort());
    await page.route('**/jjettas-pebble-light-plate.webp', route => route.abort());
    await hold(page, '**/amy-cutout.png', png);
    await hold(page, '**/*-h264.mp4', h264);
    await start(page);
    await page.waitForFunction(() => document.querySelector('.amy-portrait')?.src.endsWith('.png') && document.querySelector('.amy-lens-video')?.dataset.codec === 'h264');
    check('format errors do not reveal pending alternatives', await page.locator('.startup-cover').count() === 1);
    png.release();
    await page.locator('.amy-portrait').evaluate(img => img.decode());
    check('still covered while h264 pending', await page.locator('.startup-cover').count() === 1);
    h264.release();
    await entered(page);
    check('plate has CSS fallback', await page.locator('.bg-layers__plate').evaluate(img => img.style.visibility === 'hidden'));
    await completeVideo(page, 'valorant-gameplay-720p-h264.mp4');
  });
  await scenario('video waits for the final bytes, not just response headers', async page => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (!String(args[0]).endsWith('valorant-gameplay-720p-av1.webm')) return response;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const body = new ReadableStream({
          async start(controller) {
            controller.enqueue(bytes.subarray(0, bytes.length - 1));
            window.__videoTailPending = true;
            await new Promise(resolve => { window.__releaseVideoTail = resolve; });
            controller.enqueue(bytes.subarray(bytes.length - 1));
            controller.close();
          },
        });
        return new Response(body, { status: response.status, headers: response.headers });
      };
    });
    await start(page);
    await page.waitForFunction(() => window.__videoTailPending &&
      document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '89');
    check('last video byte still blocks ready entry', await page.locator('.startup-cover').count() === 1);
    check('partial video is never used for playback', await page.locator('video.amy-lens-video').evaluate(v => !v.hasAttribute('src') && v.paused));
    await page.evaluate(() => window.__releaseVideoTail());
    await entered(page);
    await completeVideo(page, 'valorant-gameplay-720p-av1.webm');
  });
  await scenario('downloaded video can seek to its end and replay without network', async page => {
    await start(page);
    await entered(page);
    const mediaRequests = [];
    page.on('request', request => { if (/valorant-gameplay-720p-/.test(request.url())) mediaRequests.push(request.url()); });
    await page.locator('video.amy-lens-video').evaluate(video => new Promise((resolve, reject) => {
      video.pause();
      video.addEventListener('error', () => reject(new Error('Seek failed')), { once: true });
      video.addEventListener('seeked', resolve, { once: true });
      video.currentTime = video.duration - .1;
    }));
    check('last part of full video is usable', await page.locator('video.amy-lens-video').evaluate(v => v.readyState >= 2 && v.currentTime > v.duration - .3));
    await page.getByRole('button', { name: /Saltar intro/ }).click();
    await page.getByRole('button', { name: /Repetir intro/ }).click();
    await page.waitForFunction(() => { const v = document.querySelector('video.amy-lens-video'); return !v.paused && v.currentTime < 2; });
    check('replay uses downloaded bytes without a media request', mediaRequests.length === 0, mediaRequests);
  });
  for (const filename of ['amy-hero-texture.svg', 'amy.svg', 'amy-signature-alpha.png', 'valorant-vertical-red.png', 'amy-hero-gameplay-flat-crt-poster.jpg']) {
    await scenario(`Hero resource gates entry: ${filename}`, async page => {
      const resource = latch();
      await hold(page, `**/${filename}`, resource);
      await start(page);
      await page.waitForFunction(() => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '89');
      check('decorative resource still blocks 100', await page.locator('.startup-cover').count() === 1);
      resource.release();
      await entered(page);
    });
  }
  await scenario('failed decoration uses its fallback without trapping entry', async page => {
    await page.route('**/valorant-vertical-red.png', route => route.abort());
    await start(page);
    await entered(page);
    check('broken decorative image is hidden', await page.locator('.amy-valorant-margin').evaluate(img => img.style.visibility === 'hidden'));
  });
  await scenario('all media errors settle into existing usable fallback', async page => {
    await page.route(/amy-cutout\.(webp|png)|jjettas-pebble-light-plate\.webp|valorant-gameplay-720p-/, route => route.abort());
    await start(page);
    await entered(page);
    check('static portrait fallback retained', await page.locator('.amy-hero').getAttribute('data-portrait-error') === 'true');
  });
  await scenario('stylesheet activation gates entry fonts', async page => {
    const sheet = latch();
    await page.route('https://fonts.googleapis.com/**', async route => {
      await sheet.promise;
      await route.fulfill({ contentType: 'text/css', body: fontCSS }).catch(() => {});
    });
    await start(page);
    await page.waitForFunction(() => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '56');
    check('fonts.ready cannot bypass inactive stylesheet', await page.locator('.startup-cover').count() === 1);
    sheet.release();
    await entered(page);
  });
  await scenario('decode rejection uses PNG instead of fake readiness', async page => {
    await page.addInitScript(() => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        return this.src.includes('amy-cutout.webp') ? Promise.reject(new DOMException('Test decode rejection', 'EncodingError')) : decode.call(this);
      };
    });
    await start(page);
    await entered(page);
    check('rejected WebP decode falls back to decoded PNG', await page.locator('.amy-portrait').evaluate(img => img.src.endsWith('.png') && img.naturalWidth > 0));
  });
  await scenario('stylesheet failure before React mount resolves fallback', async page => {
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route(/\/(?:src\/main\.jsx|assets\/index-[^/]+\.js)(?:\?|$)/, async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });
    await start(page);
    await page.waitForFunction(() => document.querySelector('video.amy-lens-video')?.readyState >= 2);
    await entered(page);
    check('early stylesheet error retained for React', await page.locator('link[href*="fonts.googleapis.com/css"]').evaluate(link => link.dataset.loadState === 'error'));
  });
  await scenario('autoplay denied does not block prepared entry', async page => {
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Test autoplay denial', 'NotAllowedError')); });
    await start(page);
    await entered(page);
    check('autoplay rejection uses existing pause state', await page.locator('.amy-hero').getAttribute('data-paused') === 'true');
  });
  await scenario('mobile reduced motion prepares complete video without playing it', async page => {
    await start(page);
    await entered(page);
    check('reduced motion has static hero and no horizontal overflow', await page.evaluate(() => document.querySelector('.amy-hero').dataset.static === 'true' && document.documentElement.scrollWidth <= innerWidth));
    await completeVideo(page, 'valorant-gameplay-720p-av1.webm');
    check('reduced video stays paused until explicitly requested', await page.locator('video.amy-lens-video').evaluate(v => v.paused && v.currentTime === 0));
    await capture(page, 'mobile-reduced-entered');
  }, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await scenario('motion preference changes while video is pending', async page => {
    const video = latch();
    await hold(page, '**/*-av1.webm', video);
    await start(page);
    await page.waitForFunction(() => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '89');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check('motion preference does not pretend pending download is complete', await page.locator('.startup-cover').count() === 1);
    video.release();
    await entered(page);
  });
  await scenario('full particle loading waits beyond eight seconds', async page => {
    const particles = latch();
    await hold(page, /\/depth(?:-[^/?]+)?\.f32(?:\?|$)/, particles);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    await page.waitForTimeout(8300);
    check('pending particles still covered after eight seconds', await page.locator('.startup-cover').count() === 1);
    check('pending particles never report 100', Number(await page.locator('[role=progressbar]').getAttribute('aria-valuenow')) < 100);
    check('slow load has an explicit manual exit', await page.getByRole('button', { name: 'Continuar', exact: true }).isVisible());
    particles.release();
    await entered(page);
    check('delayed particles really prepared', await page.evaluate(() => window.amyReview.getStats().startup.prepared && window.nebulosaPreview.getState().recomposition.prepared));
  });
  await scenario('background time is not counted (visibility event simulation)', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3400);
    check('hidden time does not enable Continue', await page.getByRole('button', { name: 'Continuar', exact: true }).count() === 0);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ timeout: 4000 });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await entered(page, 'continue');
    portrait.release();
  });
  for (const hash of ['#amy-home', '#agents', '#gear']) await scenario(`cold deep link ${hash}`, async page => {
    await start(page, hash);
    await entered(page, 'bypassed');
    check(`${hash} retained`, new URL(page.url()).hash === hash);
  });
  await scenario('navigation intent cancels pending cover', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    await page.evaluate(() => { location.hash = '#agents'; });
    await entered(page, 'navigation');
    check('requested fragment preserved', new URL(page.url()).hash === '#agents');
    portrait.release();
  });
  await scenario('small screen loading composition', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    check('320px cover fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.startup-cover__content').getBoundingClientRect().bottom <= innerHeight));
    await capture(page, 'mobile-loading');
    portrait.release();
    await entered(page);
  }, { viewport: { width: 320, height: 600 } });
  await scenario('navigation during dissolve takes priority over ready', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.waitForFunction(() => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '89');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    portrait.release();
    await page.locator('.startup-cover--leaving').waitFor();
    await page.evaluate(() => { location.hash = '#agents'; });
    await entered(page, 'navigation');
    check('dissolve does not own navigation destination', new URL(page.url()).hash === '#agents');
  });
  await scenario('late restored scroll cancels loading', async page => {
    const portrait = latch();
    await hold(page, '**/amy-cutout.webp', portrait);
    await start(page);
    await page.locator('.startup-cover').waitFor();
    await page.evaluate(() => scrollTo(0, 150));
    await entered(page, 'navigation');
    check('restored position is not forced back to zero', await page.evaluate(() => scrollY > 0));
    portrait.release();
  });
  await scenario('back navigation does not replay a startup cover', async page => {
    await start(page);
    await entered(page);
    await page.goto('about:blank');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.locator('#main').waitFor();
    check('history returns without loader', await page.locator('.startup-cover').count() === 0);
    check('history main unlocked', await page.locator('#main').evaluate(e => !e.inert));
  });
  await scenario('unavailable particle assets resolve usable fallback', async page => {
    await page.route(/\/depth(?:-[^/?]+)?\.f32(?:\?|$)/, route => route.abort());
    await start(page);
    await entered(page);
    check('failed particle assets are not called GPU ready', await page.evaluate(() => window.amyReview.getStats().status === 'error' && !window.amyReview.getStats().startup.prepared));
  });
  await scenario('initial hidden page resumes full preparation (visibility simulation)', async page => {
    await page.addInitScript(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    await start(page);
    await page.waitForFunction(() => window.amyReview?.getStats().startup.prepared);
    check('hidden start remains covered until visible layout', await page.locator('.startup-cover').count() === 1);
    const visibleAt = await page.evaluate(() => performance.now());
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await entered(page);
    check('initial hidden time does not satisfy the two-second visible minimum', await page.evaluate(start => performance.now() - start >= 2000, visibleAt));
    check('background and all four roles prepared on return', await page.evaluate(() =>
      document.querySelector('[data-ambient-canvas]').dataset.bgReady === 'true' &&
      document.querySelector('[data-role-icon]').dataset.roleCacheSize === '4'));
  });
  await scenario('cold entry without WebGL uses existing fallback', async page => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return String(type).includes('webgl') ? null : getContext.call(this, type, ...args);
      };
    });
    await start(page);
    await entered(page);
    check('unavailable WebGL is a fallback rather than GPU-ready', await page.evaluate(() => window.amyReview.getStats().status === 'error' && !window.amyReview.getStats().startup.prepared));
  });
} catch (error) {
  report.errors.push(error.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (output) await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failures: report.errors }));
}
