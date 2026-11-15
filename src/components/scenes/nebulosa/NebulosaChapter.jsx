import { useEffect, useRef, useState } from 'react';
import { createNebulosaLayout, NEBULOSA_LAYOUT, HERO_DWELL_FALLBACK, evaluateNebulosa } from './phases.js';
import './Nebulosa.css';
import SetupConstruction from './SetupConstruction.jsx';
import { mountAbyssalCursor } from './engine/abyssal-cursor.js';
import { SOCIALS } from './engine/social-layout.js';
import { SOCIAL_LINKS } from '@/data/profile.js';
import './engine/abyssal-cursor.css';

const clamp = value => Math.max(0, Math.min(1, value));
const socialDestinations = {
  ...Object.fromEntries(SOCIAL_LINKS.map(({ id, href }) => [id, href])),
  kick: 'https://kick.com/amyjgil',
  starvios: 'https://starvios.com/amyjgil',
};
let engineImport;
const fallbackPortrait = new URL('./engine/assets/amy-rgba.png', import.meta.url).href;

// The visual Flow pan follows the native scroll with the Hero wipe's approved
// 0.1-at-60Hz response, independent of refresh rate. step() reports whether it
// still needs another frame; it settles exactly on the target.
function createPanFollower() {
  let value = 0, last = null, initialized = false;
  return {
    get value() { return value; },
    step(target, now, snap) {
      if (!initialized || snap) { value = target; initialized = true; last = null; return false; }
      const elapsed = last === null ? 1000 / 60 : Math.max(0, now - last);
      value += (target - value) * (1 - Math.pow(1 - .1, elapsed * 60 / 1000));
      if (Math.abs(target - value) < .0004) value = target;
      const moving = value !== target;
      last = moving ? now : null;
      return moving;
    },
  };
}
// Nebulosa is born under the last 80% of the Flow pan, so the incoming screen is
// already alive. Between that point and the native birth the engine ignores progress.
function overlapBirth(progress, ranges) {
  const start = ranges.flow[0] + .2 * (ranges.flow[1] - ranges.flow[0]), [birthStart, birthEnd] = ranges.birth;
  return progress <= start || progress >= birthEnd ? progress
    : birthStart + (progress - start) * (birthEnd - birthStart) / (birthEnd - start);
}

// AMY's fusion opens with an invisible stretch (amyGather below ~.04). The engine crosses
// it while the scroll is still on the Solar field, so the nebula starts to change as soon
// as that brief field ends. The lead is held through the whole formation, whose pacing is
// therefore unchanged, and is given back over the settled tail of the amy range.
const AMY_LEAD = .12, AMY_LEAD_UNTIL = .6;
function leadAmy(progress, ranges) {
  const [fieldStart, fieldEnd] = ranges.field, amyEnd = ranges.amy[1];
  if (progress <= fieldStart || progress >= amyEnd) return progress;
  const lead = AMY_LEAD * (amyEnd - fieldEnd), join = fieldEnd + AMY_LEAD_UNTIL * (amyEnd - fieldEnd);
  if (progress <= fieldEnd) return fieldStart + (progress - fieldStart) * (fieldEnd + lead - fieldStart) / (fieldEnd - fieldStart);
  if (progress <= join) return progress + lead;
  return join + lead + (progress - join) * (amyEnd - join - lead) / (amyEnd - join);
}
// What the engine renders for a native scroll progress.
function engineStory(progress, ranges) { return leadAmy(overlapBirth(progress, ranges), ranges); }

// Required DOM for the existing renderer. Its review controls remain mounted but hidden.
// Engine styles are deliberately not imported: their html/body rules disable native scroll.
function EngineDOM({ children }) {
  return <div id="stage" aria-label="Retrato y símbolos de AMY en partículas">
    <canvas id="webgl-canvas" aria-hidden="true" />
    {children}
    <div id="comparison-layer" className="hidden" aria-hidden="true">
      <div id="comparison-clip"><canvas id="photo-canvas" /></div>
      <div id="comparison-divider"><span className="divider-handle">⇄</span></div>
      <figure id="comparison-card"><canvas id="photo-mini-canvas" /><figcaption>Fotografía original</figcaption></figure>
    </div>
    <div id="status-overlay" role="status" aria-live="polite">
      <div className="status-box">
        <div id="status-spinner" />
        <h2 id="status-title">Cargando escena</h2>
        <p id="status-message">Preparando los recursos locales.</p>
        <button id="retry-btn" className="hidden" type="button">Reintentar carga</button>
      </div>
    </div>
    <aside id="review-panel" hidden inert aria-hidden="true">
      <button className="mode-btn active" data-mode="portrait" type="button">Retrato</button>
      <button className="mode-btn" data-mode="comparison" type="button">Comparar</button>
      <button className="mode-btn" data-mode="relief" type="button">Relieve</button>
      <div id="split-control-row" hidden><input id="split-slider" type="range" min="0" max="100" defaultValue="50" /><output id="split-output">50%</output></div>
      <input id="depth-slider" type="range" min="0" max="0.26" step="0.005" defaultValue="0.12" /><output id="depth-output">0.12</output>
      <input id="particles-slider" type="range" min="80000" max="350000" step="10000" defaultValue="100000" /><output id="particles-output">100k</output>
      <button id="reset-btn" type="button">Restablecer</button>
      <button id="motion-btn" type="button">Pausar</button>
    </aside>
  </div>;
}

export default function NebulosaChapter({ startupCoverActive = false, startupFontsReady = false, onStartupProgress }) {
  const startupCover = useRef(startupCoverActive), startupCallback = useRef(onStartupProgress);
  startupCover.current = startupCoverActive;
  startupCallback.current = onStartupProgress;
  const startStartupEngine = useRef(null), prepareStartupEngine = useRef(null), refreshStartup = useRef(null);
  const chapter = useRef(null), viewport = useRef(null), screen = useRef(null);
  const about = useRef(null), recompositionCanvas = useRef(null);
  const fallback = useRef(null), retryScene = useRef(null);
  const socialElements = useRef({}), socialHover = useRef(null), socialHint = useRef(null);
  const [error, setError] = useState('');
  const [sceneFailure, setSceneFailure] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const state = useRef({ progress: 0, start: 0, span: 1, portalHeight: 0, ready: false, failed: false, paused: false, reduced: false, active: false, engineStatus: 'loading', anchorSource: 'pending', layout: NEBULOSA_LAYOUT });

  const releaseNarrativeFocus = event => {
    const focused = document.activeElement;
    if (!about.current?.contains(focused) && !fallback.current?.contains(focused) && !focused?.matches('a.nebulosa-social')) return;
    // Release before the narrative gesture, as in AgentCarousel, rather than
    // letting the outgoing inert panel blur focus halfway through the move.
    if (event.type === 'touchstart') {
      if (event.touches.length === 1) document.activeElement.blur();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && event.deltaY < -Math.abs(event.deltaX)) document.activeElement.blur();
  };

  useEffect(() => {
    const host = chapter.current, view = viewport.current, stage = document.getElementById('stage');
    const flow = document.querySelector('.grow-carousel-section');
    const portal = flow?.querySelector('.grow-portal-frame');
    const flowExitHost = document.querySelector('.nebulosa-flow-exit');
    const hero = document.querySelector('.amy-hero');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, poll = 0, disposed = false, previousEngineProgress = null, previousPause = null;
    let pendingFlowFocus = null, pendingSetupFocus = false, initialProgressApplied = false;
    let initialSetupFocusReady = false, initialSetupFocusCancelled = false;
    let recomposition, recompositionError = '', engineStarted = false, retryPending = false;
    let engineStartPromise = null, preparingStartup = false;
    let measuredWidth = innerWidth, measuredHeight = innerHeight, lastScrollY = scrollY;
    const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
    const panFollower = createPanFollower();
    let snapPan = true;

    function measureRecomposition() {
      if (!recomposition) return;
      const box = screen.current.getBoundingClientRect(), width = view.clientWidth, height = view.clientHeight;
      const title = about.current.querySelector('h2'), rect = title.getBoundingClientRect();
      const font = getComputedStyle(title), mask = document.createElement('canvas');
      mask.width = width; mask.height = height;
      const context = mask.getContext('2d');
      context.font = font.font || `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      context.fillStyle = 'white';
      context.fillText(title.textContent, rect.left - box.left, rect.top - box.top + parseFloat(font.fontSize) * .82);
      const pixels = context.getImageData(0, 0, width, height).data, targets = [];
      for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
        if (pixels[(y * width + x) * 4 + 3] > 140) targets.push([x / width, y / height]);
      }
      const outlines = about.current.querySelectorAll('[data-recomposition-path]');
      if (outlines.length) {
        for (const outline of outlines) {
          const matrix = outline.getScreenCTM();
          if (!matrix) continue;
          const length = outline.getTotalLength(), scale = Math.hypot(matrix.a, matrix.b);
          const steps = Math.max(1, Math.ceil(length * scale / 5));
          for (let step = 0; step <= steps; step += 1) {
            const point = outline.getPointAtLength(length * step / steps).matrixTransform(matrix);
            targets.push([(point.x - box.left) / width, (point.y - box.top) / height]);
          }
        }
      } else {
        for (const panel of about.current.querySelectorAll('.amy-about-panel')) {
          const r = panel.getBoundingClientRect(), left = r.left - box.left, top = r.top - box.top;
          const right = r.right - box.left, bottom = r.bottom - box.top;
          for (let x = left; x < right; x += 5) targets.push([x / width, top / height], [x / width, bottom / height]);
          for (let y = top; y < bottom; y += 5) targets.push([left / width, y / height], [right / width, y / height]);
        }
      }
      recomposition.resize(width, height, targets);
    }

    function measure() {
      if (!flow || !portal) return;
      const keepEnd = state.current.closingProgress === 1;
      const resized = measuredWidth !== innerWidth || measuredHeight !== innerHeight;
      // Browser scroll anchoring can move scrollY before resize is delivered.
      // Preserve the last painted chapter position against its previous geometry.
      const keepProgress = resized && lastScrollY >= state.current.start - 1
        && lastScrollY <= state.current.start + state.current.span + 1 ? state.current.progress : null;
      measuredWidth = innerWidth; measuredHeight = innerHeight;
      const heroStyle = hero && getComputedStyle(hero);
      const dwell = Number(heroStyle?.getPropertyValue('--hero-dwell')) || HERO_DWELL_FALLBACK;
      const layout = createNebulosaLayout(dwell);
      document.getElementById('main').style.setProperty('--nebulosa-dwell', String(dwell));
      document.getElementById('main').style.setProperty('--nebulosa-total', String(layout.totalH));
      // Use the live Hero ratio; source CSS and entrance remain untouched.
      flow.style.setProperty('--gc-dwell', String(dwell));
      const portalHeight = portal.offsetHeight;
      const staticFlow = getComputedStyle(portal).position !== 'sticky';
      const holdPixels = innerHeight * dwell;
      const overlap = staticFlow ? 0 : portalHeight + holdPixels;
      const span = innerHeight * layout.totalH;
      host.style.marginTop = `${-overlap}px`;
      host.style.height = `${span + innerHeight}px`;
      // Native offsets stay independent of the outgoing wrapper's translation.
      const flowBottom = flowExitHost.offsetTop + flowExitHost.offsetHeight;
      const start = flowBottom - overlap;
      // CSS fractions and offsetHeight rounding can put the mathematical end
      // just beyond the last reachable scroll pixel, especially on mobile.
      const end = Math.min(start + span, document.scrollingElement.scrollHeight - innerHeight);
      Object.assign(state.current, { start, span, end, portalHeight, staticFlow, reduced: reduced.matches,
        layout, holdPixels, flowHoldStart: start, flowHoldEnd: start + holdPixels,
        nebulosaHoldStart: start + layout.distances.hold[0] * innerHeight,
        nebulosaHoldEnd: start + layout.distances.hold[1] * innerHeight,
        heroDwell: dwell, heroDwellPixels: holdPixels,
        flowRelease: staticFlow ? start : flowBottom - portalHeight });
      if (keepEnd) scrollTo({ top: start + span, behavior: 'instant' });
      else if (keepProgress !== null) scrollTo({ top: start + keepProgress * span, behavior: 'instant' });
      measureRecomposition();
      schedule();
    }

    // opacity: the scroll's label envelope, which still owns the link state.
    // ink: what is painted, which enters with the label's own glyph.
    function placeLabel(element, anchor, opacity, linksActive, ink = opacity) {
      if (!element) return;
      const valid = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
      const visible = valid && (opacity > .01 || ink > .01);
      const clickable = valid && opacity > .01 && linksActive && element.hasAttribute('href');
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.opacity = String(valid ? ink : 0);
      element.setAttribute('aria-hidden', String(!visible));
      element.inert = !visible || (element.tagName === 'A' && !clickable);
      if (element.tagName === 'A') {
        element.dataset.linkActive = String(clickable);
        element.tabIndex = clickable ? 0 : -1;
        element.setAttribute('aria-disabled', String(!clickable));
      }
      if (valid) {
        element.style.left = `${anchor.x}px`;
        element.style.top = `${anchor.y - Math.max(0, anchor.height || 0) / 2 - 18}px`;
        element.style.width = `${Math.max(64, (anchor.width || 44) + 36)}px`;
        element.style.height = `${Math.max(44, (anchor.height || 44) + 54)}px`;
      }
    }

    function update() {
      frame = 0;
      const s = state.current;
      // The outgoing Flow transform moves its fragment box; restore its physical stop.
      if (pendingFlowFocus) scrollTo({ top: s.start, behavior: 'instant' });
      if (pendingSetupFocus) scrollTo({ top: s.start + s.span, behavior: 'instant' });
      const p = clamp((scrollY - s.start) / s.span), phase = evaluateNebulosa(p, s.layout);
      lastScrollY = scrollY;
      const closingProgress = s.end - scrollY <= 1 ? 1
        : clamp((p - s.layout.ranges.hold[1]) / (1 - s.layout.ranges.hold[1]));
      const chapterPhase = closingProgress >= 1 ? 'about' : closingProgress > 0 ? 'recompose' : phase.phase;
      Object.assign(s, { progress: p, closingProgress, chapterPhase, active: scrollY >= s.start && scrollY <= s.start + s.span + innerHeight });
      view.dataset.phase = chapterPhase;
      view.dataset.active = String(s.active);
      host.dataset.phase = chapterPhase;
      // Two full-width neighboring screens share one pan envelope. Only this outer
      // wrapper owns the bridge; the source portal, cards and React state stay intact.
      // Only the visual pan is damped; reduced motion, direct jumps, fragment focus,
      // first paint and positions outside the chapter take the target at once.
      const exit = phase.flowExit;
      const snap = snapPan || s.reduced || !s.active || pendingFlowFocus || pendingSetupFocus || initialSetupFocusReady;
      const following = panFollower.step(s.reduced ? Number(exit >= 1) : exit, performance.now(), snap);
      snapPan = false;
      const pan = panFollower.value;
      const bridgeEnd = s.start + s.layout.distances.flow[1] * innerHeight;
      // The vertical compensation stays locked to the native scroll position;
      // interaction follows the converged pan.
      const releaseDistance = Math.max(0, Math.min(scrollY, bridgeEnd) - s.flowRelease);
      flowExitHost.style.transform = exit > 0 || pan > 0
        ? `translate3d(${-pan * innerWidth}px,${releaseDistance}px,0)` : 'none';
      flowExitHost.inert = pan > 0;
      flowExitHost.style.pointerEvents = pan > 0 ? 'none' : '';
      // Navbar's native fragment focus can run before this frame releases inert.
      // Complete that existing focus intent once the actual Flow panel is restored.
      if (pendingFlowFocus && pan === 0 && !pendingFlowFocus.closest('[inert]')) {
        pendingFlowFocus.focus({ preventScroll: true });
        pendingFlowFocus = null;
      }
      // The incoming edge dissolves over the outgoing panel instead of a hard seam.
      const seam = .24 * innerWidth * Math.sin(Math.PI * pan);
      screen.current.style.transform = `translate3d(${((1 - pan) * innerWidth - seam).toFixed(2)}px,0,0)`;
      screen.current.style.maskImage = screen.current.style.webkitMaskImage = seam > .5
        ? `linear-gradient(90deg,transparent 0,rgba(0,0,0,.55) ${(seam * .42).toFixed(1)}px,#000 ${seam.toFixed(1)}px)` : '';
      screen.current.inert = pan < 1 || !s.active;
      screen.current.setAttribute('aria-hidden', String(pan < 1 || !s.active));
      Object.assign(s, { pan, panWidth: innerWidth, panOffset: pan * innerWidth,
        flowCompensationY: releaseDistance, bridgeEnd });
      const api = window.amyReview;
      // The engine is visible as soon as the incoming screen shows; Flow hold renders nothing.
      const storyProgress = engineStory(p, s.layout.ranges);
      const birth = evaluateNebulosa(storyProgress, s.layout).birth;
      // Effective values the engine renders (raw progress/birth stay in getState() as before).
      Object.assign(s, { storyProgress, storyBirth: birth });
      const engineVisible = s.ready && (pan > .01 || birth > 0) && p < 1;
      const dissolve = s.reduced ? Number(closingProgress > 0) : ease(closingProgress / .17);
      const fallbackVisible = s.failed && s.active && pan === 1 && birth > 0 && dissolve < 1;
      const releaseFallbackFocus = !fallbackVisible && fallback.current?.contains(document.activeElement);
      screen.current.dataset.fallback = String(s.failed);
      fallback.current.hidden = !fallbackVisible;
      fallback.current.inert = !fallbackVisible;
      fallback.current.setAttribute('aria-hidden', String(!fallbackVisible));
      fallback.current.style.opacity = String(1 - dissolve);
      let stats = api?.getStats();
      if (s.ready && api) {
        api.setPresentationVisible?.(engineVisible && dissolve < 1 && !startupCover.current);
        // Keep the accepted live scene formed while A takes over its closing pixels.
        const engineProgress = Math.min(storyProgress, s.layout.ranges.hold[1]);
        if (previousEngineProgress !== engineProgress) {
          api.setStoryProgress(engineProgress);
          previousEngineProgress = engineProgress;
        }
        const motionPaused = s.paused || s.reduced || !s.active || p >= 1 || startupCover.current;
        if (previousPause !== motionPaused) {
          api.setMotionPaused(motionPaused);
          previousPause = motionPaused;
        }
        stats = api.getStats();
      }
      stage.dataset.engineVisible = String(engineVisible);
      stage.dataset.engineStatus = s.engineStatus;
      stage.style.pointerEvents = engineVisible && dissolve < 1 && !s.reduced && !s.paused ? 'auto' : 'none';
      document.getElementById('webgl-canvas').style.opacity = String(1 - dissolve);
      const aboutOpacity = s.reduced ? Number(closingProgress > 0) : ease((closingProgress - .52) / .43);
      about.current.style.opacity = String(aboutOpacity);
      about.current.inert = (s.reduced ? closingProgress <= 0 : closingProgress < .94) || !s.active;
      about.current.setAttribute('aria-hidden', String(aboutOpacity <= .01 || !s.active));
      if ((pendingSetupFocus || initialSetupFocusReady) && !about.current.closest('[inert]')) {
        const focused = document.activeElement;
        if (pendingSetupFocus || (!initialSetupFocusCancelled && location.hash === '#gear'
          && closingProgress === 1 && (focused === document.body || focused === about.current))) {
          about.current.focus({ preventScroll: true });
        }
        pendingSetupFocus = false;
        if (initialSetupFocusReady) cancelInitialSetupFocus();
      }
      recomposition?.update(closingProgress, s.reduced);
      const anchors = stats?.story?.anchors;
      s.anchorSource = anchors ? 'engine' : 'unavailable';
      const labelsOpacity = closingProgress > 0 ? (s.reduced ? 0 : 1 - ease(closingProgress / .20)) : phase.labelsOpacity;
      const linksActive = s.ready && s.active && pan === 1 && phase.logoGather === 1 && dissolve < 1
        && (closingProgress > 0 ? labelsOpacity > .01 : labelsOpacity >= .99);
      s.socialLinksActive = linksActive;
      // Each name is inked over the last stretch of its own glyph's formation, in one
      // continuous move with it, instead of waiting for the scroll's label range. Leaving
      // (closing or scrolling back) still takes it out.
      const icons = stats?.icons, leaving = closingProgress > 0 ? labelsOpacity : 1;
      for (const social of SOCIALS) {
        const ink = !s.ready ? 0 : icons && !s.reduced ? leaving * ease((icons.glyphs[social.id] - .6) / .4) : labelsOpacity;
        placeLabel(socialElements.current[social.id], anchors?.[social.id], s.ready ? labelsOpacity : 0, linksActive, ink);
      }
      if (socialHint.current) socialHint.current.hidden = !linksActive || Boolean(icons && !s.reduced && icons.value < 1);
      if (releaseFallbackFocus) {
        const next = linksActive && host.querySelector('a.nebulosa-social[data-link-active="true"]');
        if (next) next.focus({ preventScroll: true });
        else document.activeElement.blur();
      }
      // The same frame loop continues only while the visual pan converges or the
      // running engine is still forming the glyphs.
      if (following || (icons && !icons.settled && s.active && previousPause === false)) schedule();
    }

    function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(update); }
    function heldSocial() {
      if (!state.current.socialLinksActive || !document.hasFocus()) return null;
      const focused = document.activeElement?.matches('a.nebulosa-social:focus-visible') ? document.activeElement : null;
      return [focused, socialHover.current].find(element => element && host.contains(element)
        && !element.closest('[inert]') && element.getAttribute('aria-hidden') === 'false') || null;
    }
    function releaseSocialFocus(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
      if (!heldSocial()) return;
      socialHover.current = null;
      if (document.activeElement?.matches('a.nebulosa-social')) document.activeElement.blur();
    }
    function rememberFlowFragment(event) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const href = event.target.closest?.('a[href]')?.getAttribute('href');
      const target = href?.startsWith('#') && document.getElementById(href.slice(1));
      if (target && flow?.contains(target)) { pendingFlowFocus = target; schedule(); }
      if (href === '#gear') { pendingSetupFocus = true; schedule(); }
    }
    function goTo(progress) {
      scrollTo({ top: state.current.start + clamp(Number(progress) || 0) * state.current.span, behavior: 'instant' });
      snapPan = true; update();
    }
    function checkEngine() {
      if (disposed) return;
      clearTimeout(poll); poll = 0;
      const api = window.amyReview, stats = api?.getStats();
      state.current.engineStatus = stats?.status || 'loading';
      if (stats?.status === 'ready') {
        // Apply the current chapter state synchronously before revealing its first frame.
        state.current.ready = true;
        state.current.failed = false;
        setSceneFailure(false);
        // Same effective progress that update() feeds the engine: avoids a second render at ready.
        const readyProgress = Math.min(engineStory(state.current.progress, state.current.layout.ranges), state.current.layout.ranges.hold[1]);
        api.setStoryProgress(readyProgress);
        previousEngineProgress = readyProgress;
        setError(recompositionError);
        if (!initialProgressApplied) {
          initialProgressApplied = true;
          const entry = new URLSearchParams(location.search).get('p');
          if (import.meta.env.DEV && entry !== null && Number.isFinite(Number(entry))) goTo(Number(entry));
        }
        update();
      } else if (stats?.status === 'error') {
        state.current.ready = false;
        state.current.failed = true;
        setSceneFailure(true);
        setError('');
        // A retry explicitly checks the renderer again; a permanent WebGL failure
        // does not need an endless background poll.
        update();
      } else poll = setTimeout(checkEngine, 150);
    }
    retryScene.current = async () => {
      if (disposed || retryPending) return;
      const api = window.amyReview;
      if (!api?.reloadAssets || document.getElementById('retry-btn').classList.contains('hidden')) {
        location.reload();
        return;
      }
      retryPending = true;
      setRetrying(true);
      try {
        await api.reloadAssets();
        if (!disposed) checkEngine();
      } catch (cause) {
        if (!disposed) {
          console.error('No se ha podido reintentar la escena.', cause);
          state.current.engineStatus = 'error';
          state.current.failed = true;
          setSceneFailure(true);
          update();
        }
      } finally {
        retryPending = false;
        if (!disposed) setRetrying(false);
      }
    };
    measure(); update();
    function cancelInitialSetupFocus() {
      initialSetupFocusCancelled = true;
      initialSetupFocusReady = false;
      removeEventListener('load', requestInitialSetupFocus);
      for (const name of ['keydown', 'pointerdown', 'wheel', 'touchstart']) removeEventListener(name, cancelInitialSetupFocus, true);
    }
    function requestInitialSetupFocus() {
      if (disposed || initialSetupFocusCancelled || location.hash !== '#gear') return;
      initialSetupFocusReady = true;
      schedule();
    }
    if (location.hash === '#gear') {
      for (const name of ['keydown', 'pointerdown', 'wheel', 'touchstart']) addEventListener(name, cancelInitialSetupFocus, { capture: true, passive: true });
    }
    // React mounts after native fragment resolution; target the physical final viewport.
    const initialSetupFrame = location.hash === '#gear' ? requestAnimationFrame(() => {
      document.getElementById('gear')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      // Firefox can clear pre-load focus while completing the navigation.
      if (document.readyState === 'complete') requestInitialSetupFocus();
      else addEventListener('load', requestInitialSetupFocus, { once: true });
      schedule();
    }) : 0;
    window.nebulosaPreview = {
      goTo,
      getState: () => ({ ...state.current, ...evaluateNebulosa(state.current.progress, state.current.layout), phase: state.current.chapterPhase, socialHold: heldSocial()?.dataset.social || null, recomposition: recomposition?.stats() || null, engine: window.amyReview?.getStats() || null }),
    };
    function startEngine() {
      if (engineStarted || disposed) return engineStartPromise;
      engineStarted = true;
      engineObserver.disconnect();
      engineImport ||= import('./engine/main.js');
      engineStartPromise = engineImport.then(async () => {
        if (disposed) return;
        if (startupCover.current) {
          window.amyReview?.setPresentationVisible(false);
          window.amyReview?.setMotionPaused(true);
        }
        try {
          const { createRecomposition } = await import('./engine/recomposition.js');
          if (disposed) return;
          recomposition = createRecomposition({ canvas: recompositionCanvas.current });
          measureRecomposition();
        } catch (cause) {
          if (disposed) return;
          console.error('No se ha podido iniciar la recomposición.', cause);
          recomposition?.dispose(); recomposition = null;
          recompositionError = 'No se ha podido iniciar la transición. Vuelve a cargar la página.';
          setError(recompositionError);
        }
        checkEngine();
      }).catch(cause => {
        if (disposed) return;
        state.current.engineStatus = 'import-error';
        state.current.failed = true;
        console.error('No se ha podido importar el motor Nebulosa.', cause);
        setError(''); setSceneFailure(true); update();
      });
      return engineStartPromise;
    }
    startStartupEngine.current = startEngine;
    refreshStartup.current = update;
    prepareStartupEngine.current = async () => {
      if (preparingStartup || disposed) return;
      preparingStartup = true;
      await startEngine();
      if (disposed) return;
      try {
        if (!window.amyReview?.prepareStartup) throw new Error('Particle engine unavailable.');
        await window.amyReview.prepareStartup();
        if (!disposed) startupCallback.current?.('nebula', 'ready');
      } catch {
        if (!disposed) startupCallback.current?.('nebula', 'fallback');
      }
      if (disposed) return;
      try {
        if (!recomposition) throw new Error('Recomposition unavailable.');
        // Fonts and the actual destination layout have settled before this call.
        measureRecomposition();
        await recomposition.prepareStartup();
        if (!disposed) startupCallback.current?.('recomposition', 'ready');
      } catch {
        if (!disposed) startupCallback.current?.('recomposition', 'fallback');
      }
      if (!disposed) { checkEngine(); update(); }
    };
    // Deep links and manual continuation retain the near-chapter loading path.
    const engineObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) startEngine();
    }, { rootMargin: `${Math.ceil(innerHeight * 2)}px 0px` });
    engineObserver.observe(host);
    if (window.amyReview || (import.meta.env.DEV && new URLSearchParams(location.search).has('p'))) startEngine();
    const observer = new ResizeObserver(measure);
    if (flow) observer.observe(flow);
    if (portal) observer.observe(portal);
    document.fonts.ready.then(() => { if (!disposed) measure(); });
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('keydown', releaseSocialFocus);
    document.addEventListener('click', rememberFlowFragment, true);
    addEventListener('resize', measure);
    reduced.addEventListener('change', measure);
    const pauseEvent = () => schedule();
    host.addEventListener('nebulosa-pause', pauseEvent);
    return () => {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(poll); observer.disconnect();
      startStartupEngine.current = prepareStartupEngine.current = refreshStartup.current = null;
      retryScene.current = null;
      engineObserver.disconnect();
      cancelAnimationFrame(initialSetupFrame);
      cancelInitialSetupFocus();
      recomposition?.dispose();
      removeEventListener('scroll', schedule); removeEventListener('resize', measure);
      removeEventListener('keydown', releaseSocialFocus);
      socialHover.current = null;
      document.removeEventListener('click', rememberFlowFragment, true);
      reduced.removeEventListener('change', measure); host.removeEventListener('nebulosa-pause', pauseEvent);
      if (flowExitHost) { flowExitHost.style.transform = ''; flowExitHost.style.pointerEvents = ''; flowExitHost.inert = false; }
      if (flow) flow.style.removeProperty('--gc-dwell');
      delete window.nebulosaPreview;
    };
  }, []);

  useEffect(() => {
    refreshStartup.current?.();
    if (startupCoverActive) {
      startStartupEngine.current?.();
      if (startupFontsReady) prepareStartupEngine.current?.();
    }
  }, [startupCoverActive, startupFontsReady]);

  useEffect(() => {
    const cursor = mountAbyssalCursor();
    return () => cursor.dispose();
  }, []);

  return <>
    <section ref={chapter} id="nebulosa-chapter" className="nebulosa-chapter" aria-label="Nebulosa">
      <div id="gear" className="nebulosa-end-anchor" aria-hidden="true" />
      <div ref={viewport} className="nebulosa-viewport">
        <div ref={screen} className="nebulosa-screen" inert aria-hidden="true"
          onWheelCapture={releaseNarrativeFocus} onTouchStartCapture={releaseNarrativeFocus}>
        <section ref={about} className="amy-about setup-construction" aria-labelledby="amy-about-heading" tabIndex={-1} inert aria-hidden="true">
          <SetupConstruction />
        </section>
        <EngineDOM>
        {SOCIALS.map(social => {
          const props = {
            ref: element => { socialElements.current[social.id] = element; },
            className: `nebulosa-social nebulosa-social--${social.id}`,
            'data-social': social.id,
            'aria-hidden': 'true',
            'aria-label': socialDestinations[social.id] ? `${social.label} de AMY (abre en otra pestaña)` : `${social.label}, próximamente`,
            onPointerEnter: event => { if (event.pointerType === 'mouse') socialHover.current = event.currentTarget; },
            onPointerLeave: event => { if (socialHover.current === event.currentTarget) socialHover.current = null; },
            onPointerDown: event => { if (event.pointerType !== 'mouse') socialHover.current = null; },
          };
          if (socialDestinations[social.id]) return <a key={social.id} {...props} href={socialDestinations[social.id]} target="_blank" rel="noopener noreferrer" tabIndex={-1} inert data-link-active="false" aria-disabled="true"><span>{social.label}<span className="nebulosa-link-arrow" aria-hidden="true">↗</span></span></a>;
          return <span key={social.id} {...props} role="img"><span>{social.label}<small className="nebulosa-social-status">Próximamente</small></span></span>;
        })}
        <p ref={socialHint} className="nebulosa-social-hint" hidden><strong>Mis redes</strong> · <span className="nebulosa-hint-desktop">Haz clic en un icono para visitar mi perfil</span><span className="nebulosa-hint-touch">Toca un icono para visitar mi perfil</span><span aria-hidden="true"> ↗</span></p>
        </EngineDOM>
        <canvas ref={recompositionCanvas} className="nebulosa-recomposition" aria-hidden="true" />
        <section ref={fallback} className="nebulosa-fallback" aria-labelledby="amy-fallback-heading" hidden inert aria-hidden="true">
          <div className="nebulosa-fallback__content">
            {sceneFailure && <img src={fallbackPortrait} alt="" className="nebulosa-fallback__portrait" />}
            <h2 id="amy-fallback-heading">AMY</h2>
            <p role="status">{retrying ? 'Volviendo a cargar la escena…' : 'La escena no está disponible. Puedes seguir visitando mis redes.'}</p>
            <nav aria-label="Redes de AMY">
              {SOCIALS.filter(social => socialDestinations[social.id]).map(social => <a key={social.id}
                data-fallback-social={social.id} href={socialDestinations[social.id]} target="_blank" rel="noopener noreferrer"
                aria-label={`${social.label} de AMY (abre en otra pestaña)`}>{social.label}<span aria-hidden="true"> ↗</span></a>)}
            </nav>
            <button type="button" aria-disabled={retrying} aria-busy={retrying} onClick={() => retryScene.current?.()}>Volver a intentar</button>
          </div>
        </section>
        {error && <div className="nebulosa-import-error" role="alert"><p>{error}</p><button type="button" onClick={() => location.reload()}>Volver a cargar la escena</button></div>}
        </div>
      </div>
    </section>

  </>;
}
