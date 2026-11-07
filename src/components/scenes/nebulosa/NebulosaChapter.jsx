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

export default function NebulosaChapter() {
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
    let recomposition, recompositionError = '', engineStarted = false, retryPending = false;
    const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

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
      Object.assign(state.current, { start, span, portalHeight, staticFlow, reduced: reduced.matches,
        layout, holdPixels, flowHoldStart: start, flowHoldEnd: start + holdPixels,
        nebulosaHoldStart: start + layout.distances.hold[0] * innerHeight,
        nebulosaHoldEnd: start + layout.distances.hold[1] * innerHeight,
        heroDwell: dwell, heroDwellPixels: holdPixels,
        flowRelease: staticFlow ? start : flowBottom - portalHeight });
      if (keepEnd) scrollTo({ top: start + span, behavior: 'instant' });
      measureRecomposition();
      schedule();
    }

    function placeLabel(element, anchor, opacity, linksActive) {
      if (!element) return;
      const valid = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
      const visible = valid && opacity > .01;
      const clickable = visible && linksActive && element.hasAttribute('href');
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.opacity = String(valid ? opacity : 0);
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
      const p = clamp((scrollY - s.start) / s.span), phase = evaluateNebulosa(p, s.layout);
      const closingProgress = s.start + s.span - scrollY <= 1 ? 1
        : clamp((p - s.layout.ranges.hold[1]) / (1 - s.layout.ranges.hold[1]));
      const chapterPhase = closingProgress >= 1 ? 'about' : closingProgress > 0 ? 'recompose' : phase.phase;
      Object.assign(s, { progress: p, closingProgress, chapterPhase, active: scrollY >= s.start && scrollY <= s.start + s.span + innerHeight });
      view.dataset.phase = chapterPhase;
      view.dataset.active = String(s.active);
      host.dataset.phase = chapterPhase;
      // Two full-width neighboring screens share one pan envelope. Only this outer
      // wrapper owns the bridge; the source portal, cards and React state stay intact.
      const exit = phase.flowExit, pan = s.reduced ? Number(exit >= 1) : exit;
      const bridgeEnd = s.start + s.layout.distances.flow[1] * innerHeight;
      const releaseDistance = Math.max(0, Math.min(scrollY, bridgeEnd) - s.flowRelease);
      flowExitHost.style.transform = exit > 0
        ? `translate3d(${-pan * innerWidth}px,${releaseDistance}px,0)` : 'none';
      flowExitHost.inert = exit > 0;
      flowExitHost.style.pointerEvents = exit > 0 ? 'none' : '';
      // Navbar's native fragment focus can run before this frame releases inert.
      // Complete that existing focus intent once the actual Flow panel is restored.
      if (pendingFlowFocus && exit === 0 && !pendingFlowFocus.closest('[inert]')) {
        pendingFlowFocus.focus({ preventScroll: true });
        pendingFlowFocus = null;
      }
      screen.current.style.transform = `translate3d(${(1 - pan) * innerWidth}px,0,0)`;
      screen.current.inert = pan < 1 || !s.active;
      screen.current.setAttribute('aria-hidden', String(pan < 1 || !s.active));
      Object.assign(s, { pan, panWidth: innerWidth, panOffset: pan * innerWidth,
        flowCompensationY: releaseDistance, bridgeEnd });
      const api = window.amyReview;
      const engineVisible = s.ready && phase.birth > 0 && p < 1;
      const dissolve = s.reduced ? Number(closingProgress > 0) : ease(closingProgress / .17);
      const fallbackVisible = s.failed && s.active && pan === 1 && phase.birth > 0 && dissolve < 1;
      const releaseFallbackFocus = !fallbackVisible && fallback.current?.contains(document.activeElement);
      screen.current.dataset.fallback = String(s.failed);
      fallback.current.hidden = !fallbackVisible;
      fallback.current.inert = !fallbackVisible;
      fallback.current.setAttribute('aria-hidden', String(!fallbackVisible));
      fallback.current.style.opacity = String(1 - dissolve);
      let stats = api?.getStats();
      if (s.ready && api) {
        api.setPresentationVisible?.(engineVisible && dissolve < 1);
        // Keep the accepted live scene formed while A takes over its closing pixels.
        const engineProgress = Math.min(p, s.layout.ranges.hold[1]);
        if (previousEngineProgress !== engineProgress) {
          api.setStoryProgress(engineProgress);
          previousEngineProgress = engineProgress;
        }
        const motionPaused = s.paused || s.reduced || !s.active || p >= 1;
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
      if (pendingSetupFocus && !about.current.closest('[inert]')) {
        about.current.focus({ preventScroll: true });
        pendingSetupFocus = false;
      }
      recomposition?.update(closingProgress, s.reduced);
      const anchors = stats?.story?.anchors;
      s.anchorSource = anchors ? 'engine' : 'unavailable';
      const labelsOpacity = closingProgress > 0 ? (s.reduced ? 0 : 1 - ease(closingProgress / .20)) : phase.labelsOpacity;
      const linksActive = s.ready && s.active && pan === 1 && phase.logoGather === 1 && dissolve < 1
        && (closingProgress > 0 ? labelsOpacity > .01 : labelsOpacity >= .99);
      s.socialLinksActive = linksActive;
      for (const social of SOCIALS) {
        placeLabel(socialElements.current[social.id], anchors?.[social.id], s.ready ? labelsOpacity : 0, linksActive);
      }
      if (socialHint.current) socialHint.current.hidden = !linksActive;
      if (releaseFallbackFocus) {
        const next = linksActive && host.querySelector('a.nebulosa-social[data-link-active="true"]');
        if (next) next.focus({ preventScroll: true });
        else document.activeElement.blur();
      }

    }

    function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(update); }
    function heldSocial() {
      if (!state.current.socialLinksActive || !document.hasFocus()) return null;
      const focused = document.activeElement?.matches('a.nebulosa-social:focus-visible') ? document.activeElement : null;
      return [focused, socialHover.current].find(element => element && host.contains(element)
        && !element.closest('[inert]') && element.getAttribute('aria-hidden') === 'false') || null;
    }
    function holdSocialWheel(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.deltaY > 0 && heldSocial()) event.preventDefault();
    }
    function holdSocialKey(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
      if (!heldSocial()) return;
      if (event.key === 'Escape') {
        socialHover.current = null;
        if (document.activeElement?.matches('a.nebulosa-social')) document.activeElement.blur();
      } else if (['ArrowDown', 'PageDown', ' '].includes(event.key)) event.preventDefault();
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
      update();
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
        api.setStoryProgress(state.current.progress);
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
    // React mounts after native fragment resolution; target the physical final viewport.
    const initialSetupFrame = location.hash === '#gear' ? requestAnimationFrame(() => {
      pendingSetupFocus = true;
      document.getElementById('gear')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      schedule();
    }) : 0;
    window.nebulosaPreview = {
      goTo,
      getState: () => ({ ...state.current, ...evaluateNebulosa(state.current.progress, state.current.layout), phase: state.current.chapterPhase, socialHold: heldSocial()?.dataset.social || null, recomposition: recomposition?.stats() || null, engine: window.amyReview?.getStats() || null }),
    };
    function startEngine() {
      if (engineStarted || disposed) return;
      engineStarted = true;
      engineObserver.disconnect();
      engineImport ||= import('./engine/main.js');
      engineImport.then(async () => {
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
    }
    // Prewarm near the chapter instead of downloading/allocating the portrait at Hero entry.
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
    addEventListener('wheel', holdSocialWheel, { passive: false });
    addEventListener('keydown', holdSocialKey);
    document.addEventListener('click', rememberFlowFragment, true);
    addEventListener('resize', measure);
    reduced.addEventListener('change', measure);
    const pauseEvent = () => schedule();
    host.addEventListener('nebulosa-pause', pauseEvent);
    return () => {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(poll); observer.disconnect();
      retryScene.current = null;
      engineObserver.disconnect();
      cancelAnimationFrame(initialSetupFrame);
      recomposition?.dispose();
      removeEventListener('scroll', schedule); removeEventListener('resize', measure);
      removeEventListener('wheel', holdSocialWheel); removeEventListener('keydown', holdSocialKey);
      socialHover.current = null;
      document.removeEventListener('click', rememberFlowFragment, true);
      reduced.removeEventListener('change', measure); host.removeEventListener('nebulosa-pause', pauseEvent);
      if (flowExitHost) { flowExitHost.style.transform = ''; flowExitHost.style.pointerEvents = ''; flowExitHost.inert = false; }
      if (flow) flow.style.removeProperty('--gc-dwell');
      delete window.nebulosaPreview;
    };
  }, []);

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
