import { useCallback, useEffect, useRef, useState } from 'react';
import './StartupCover.css';

export function shouldPrepareStartup() {
  return !window.location.hash && window.scrollY === 0 &&
    performance.getEntriesByType('navigation')[0]?.type !== 'back_forward';
}

// The stylesheet starts as preload in index.html. fonts.ready alone can resolve
// before it becomes a stylesheet and would report a false success.
function waitForEntryFonts(resolve) {
  let active = true;
  let requested = false;
  const sheet = document.querySelector('link[href*="fonts.googleapis.com/css"]');
  const finish = (state) => { if (active) resolve(state); };
  const loadFonts = (stylesheetFailed = false) => {
    if (requested) return;
    requested = true;
    if (!document.fonts) { finish('fallback'); return; }
    Promise.all([
      document.fonts.load('600 16px Antonio', 'AMY J. GIL'),
      document.fonts.load('700 16px Antonio', 'AMY J. GIL'),
      document.fonts.load('400 16px Cinzel', 'AMY'),
      document.fonts.load('400 16px Inter', 'AMY'),
      document.fonts.load('450 16px Inter', 'AMY'),
      document.fonts.load('500 16px Inter', 'AMY'),
      document.fonts.load('600 16px Inter', 'AMY'),
      document.fonts.load('700 16px Inter', 'AMY'),
      document.fonts.load('500 16px Rajdhani', 'AMY'),
      document.fonts.load('600 16px Rajdhani', 'AMY'),
      document.fonts.load('700 16px Rajdhani', 'AMY'),
      document.fonts.load('400 16px Qadone', 'AMY SETUP SAGE'),
    ]).then(async (faces) => {
      // All mounted scenes now participate in startup, including their fonts.
      await document.fonts.ready;
      finish(!stylesheetFailed && faces.every((group) => group.length && group.every((face) => face.status === 'loaded')) ? 'ready' : 'fallback');
    }, () => finish('fallback'));
  };
  const load = () => { if (sheet?.rel === 'stylesheet' && sheet.sheet) loadFonts(); };
  const failed = () => loadFonts(true);
  const observer = new MutationObserver(load);
  if (sheet) {
    observer.observe(sheet, { attributes: true, attributeFilter: ['rel'] });
    sheet.addEventListener('load', load);
    sheet.addEventListener('error', failed);
    if (sheet.dataset.loadState === 'error') failed();
    else load();
  } else failed();
  return () => {
    active = false;
    observer.disconnect();
    sheet?.removeEventListener('load', load);
    sheet?.removeEventListener('error', failed);
  };
}

export default function StartupCover({ tasks, onFinish, onFontsPrepared }) {
  const root = useRef(null);
  const continueButton = useRef(null);
  const closing = useRef(false);
  const painted = useRef(false);
  const exitTimer = useRef(0);
  const highestProgress = useRef(0);
  const [fonts, setFonts] = useState('pending');
  const [minimumVisible, setMinimumVisible] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const states = Object.values({ ...tasks, fonts });
  const resolved = states.filter((state) => state !== 'pending').length;
  highestProgress.current = Math.max(highestProgress.current, Math.min(99, Math.round(resolved / states.length * 100)));
  const progress = resolved === states.length ? 100 : highestProgress.current;

  const finish = useCallback((reason) => {
    if (closing.current) {
      // A destination chosen during the dissolve owns the exit immediately.
      if (reason === 'navigation' && exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = 0;
        onFinish(reason);
      }
      return;
    }
    closing.current = true;
    const dissolve = reason === 'ready' && painted.current && !document.hidden &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dissolve) {
      setLeaving(true);
      exitTimer.current = window.setTimeout(() => { exitTimer.current = 0; onFinish(reason); }, 200);
    } else onFinish(reason);
  }, [onFinish]);

  useEffect(() => waitForEntryFonts(setFonts), []);
  useEffect(() => { if (fonts !== 'pending') onFontsPrepared?.(fonts); }, [fonts, onFontsPrepared]);
  useEffect(() => { if (progress === 100 && minimumVisible) finish('ready'); }, [progress, minimumVisible, finish]);

  useEffect(() => {
    closing.current = false;
    // Two RAFs allow one paint opportunity; the first RAF is still before paint.
    // Cached readiness in that first frame must not force a visible dissolve.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { painted.current = true; });
    });
    const cover = root.current;
    if (document.activeElement === document.body) cover.focus({ preventScroll: true });
    const preventScroll = (event) => { event.preventDefault(); event.stopPropagation(); };
    const onKey = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        (continueButton.current || cover).focus({ preventScroll: true });
      } else if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key) &&
        event.target !== continueButton.current) event.preventDefault();
    };
    const navigate = () => finish('navigation');
    const restoredScroll = () => { if (window.scrollY !== 0) navigate(); };
    const pageShown = (event) => { if (event.persisted) navigate(); };
    cover.addEventListener('wheel', preventScroll, { passive: false });
    cover.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('popstate', navigate);
    window.addEventListener('scroll', restoredScroll, { passive: true });
    window.addEventListener('pageshow', pageShown);
    // Recheck after mount in case the browser restored scroll between render
    // and effects. None of these routes writes the document's scroll position.
    if (!shouldPrepareStartup()) navigate();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(exitTimer.current);
      cover.removeEventListener('wheel', preventScroll);
      cover.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('popstate', navigate);
      window.removeEventListener('scroll', restoredScroll);
      window.removeEventListener('pageshow', pageShown);
    };
  }, [finish]);

  useEffect(() => {
    let elapsed = 0;
    let since = document.hidden ? null : performance.now();
    let timer = 0;
    const tick = () => {
      clearTimeout(timer);
      const now = performance.now();
      if (since !== null) elapsed += now - since;
      since = document.hidden ? null : now;
      setHidden(document.hidden);
      if (elapsed >= 2000) setMinimumVisible(true);
      if (elapsed >= 3000) setCanContinue(true);
      if (elapsed >= 8000) { setSlow(true); return; }
      const next = elapsed < 2000 ? 2000 : elapsed < 3000 ? 3000 : 8000;
      if (!document.hidden) timer = window.setTimeout(tick, next - elapsed);
    };
    document.addEventListener('visibilitychange', tick);
    tick();
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
  }, [finish]);

  return (
    <section ref={root} className={`startup-cover${leaving ? ' startup-cover--leaving' : ''}`}
      tabIndex={-1} aria-label="Cargando la web de AMY" data-hidden={hidden}>
      <div className="startup-cover__content">
        <div className="startup-cover__squares" aria-hidden="true"><i /><i /><i /><i /></div>
        <p className="startup-cover__brand">AMY J. GIL</p>
        <p className="startup-cover__status" role="status">{slow ? 'Seguimos cargando la web' : 'Cargando la web'}</p>
        <div className="startup-cover__progress" role="progressbar" aria-label="Carga de la web"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="startup-cover__percentage" aria-hidden="true">{progress}%</span>
        <div className="startup-cover__action">
          {canContinue && <button ref={continueButton} type="button" onClick={() => finish('continue')}>Continuar</button>}
        </div>
      </div>
    </section>
  );
}
