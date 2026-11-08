import { useEffect, useRef } from 'react';
import createNebula from './background/c/scene.js';

const FACTORIES = { c: createNebula };

export default function ParticleBackdrop({ mode = 'c', paused, onPreference, prepareStartup = false, onPrepared }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const pausedRef = useRef(paused);
  const preparedCallback = useRef(onPrepared);
  preparedCallback.current = onPrepared;
  const preparationRequested = useRef(prepareStartup);
  preparationRequested.current = prepareStartup;

  useEffect(() => {
    const canvas = canvasRef.current;
    const scope = canvas.closest('.agent-arsenal') || document;
    const state = { mode, frames: 0, particles: 0, active: false, reduced: false, paused: pausedRef.current, error: null };
    canvas.__backgroundState = state;
    canvas.dataset.bgReady = 'false';
    let context;
    try { context = canvas.getContext('2d', { alpha: true }); } catch { preparedCallback.current?.('fallback'); return undefined; }
    if (!context) { preparedCallback.current?.('fallback'); return undefined; }
    const scene = FACTORIES[mode]();
    const mask = document.createElement('canvas');
    const maskContext = mask.getContext('2d');
    if (!maskContext) { scene.dispose(); preparedCallback.current?.('fallback'); return undefined; }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches;
    let manualPause = pausedRef.current;
    let disposed = false, inView = true, failed = false, maskDirty = true;
    let frame = 0, previous = 0, time = 0, width = 1, height = 1, dpr = 1;
    let preparationReported = false;
    const pointer = { x: 0, y: 0, active: false };
    const desired = { x: 0, y: 0, active: false };

    function canRun() { return !disposed && !failed && !manualPause && !reduced && inView && !document.hidden; }
    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; previous = 0; state.active = false;
    }
    function updateMask() {
      maskDirty = false;
      const origin = canvas.getBoundingClientRect();
      maskContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskContext.globalCompositeOperation = 'source-over';
      maskContext.globalAlpha = 1; maskContext.filter = 'none';
      maskContext.clearRect(0, 0, width, height);
      maskContext.fillStyle = '#fff'; maskContext.fillRect(0, 0, width, height);
      maskContext.globalCompositeOperation = 'destination-out';
      maskContext.fillStyle = '#000'; maskContext.filter = 'blur(25px)';
      for (const [selector, opacity, padding] of [['.lab-title', .88, 22], ['.agent-intro__copy', .96, 18]]) {
        const element = scope.querySelector(selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        maskContext.globalAlpha = opacity;
        maskContext.fillRect(rect.left - origin.left - padding, rect.top - origin.top - padding, rect.width + padding * 2, rect.height + padding * 2);
      }
      const logo = scope.querySelector('[data-role-icon]');
      if (logo) {
        const rect = logo.getBoundingClientRect();
        maskContext.globalAlpha = .97;
        maskContext.beginPath();
        maskContext.ellipse(rect.left - origin.left + rect.width / 2, rect.top - origin.top + rect.height / 2, rect.width * .54 + 14, rect.height * .54 + 14, 0, 0, Math.PI * 2);
        maskContext.fill();
      }
      maskContext.globalAlpha = 1; maskContext.filter = 'none';
      maskContext.globalCompositeOperation = 'source-over';
    }
    function draw(delta = 0, preparing = false) {
      if (disposed || failed || (!inView && !preparing) || document.hidden) return;
      try {
        if (maskDirty) updateMask();
        if (mode !== 'c') {
          const easing = 1 - Math.exp(-delta / .18);
          pointer.x += (desired.x - pointer.x) * easing;
          pointer.y += (desired.y - pointer.y) * easing;
          pointer.active = desired.active || Math.abs(pointer.x) + Math.abs(pointer.y) > .002;
        }
        context.save();
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.filter = 'none';
        context.clearRect(0, 0, width, height);
        scene.draw(context, { width, height, time: reduced ? 0 : time, delta: reduced ? 0 : delta, pointer: reduced ? { x: 0, y: 0, active: false } : pointer, reduced });
        context.restore();
        context.save();
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.globalAlpha = 1; context.globalCompositeOperation = 'destination-in'; context.filter = 'none';
        context.drawImage(mask, 0, 0, width, height);
        context.restore();
        state.frames += 1; state.particles = scene.particleCount;
        canvas.dataset.bgReady = 'true';
        if (!preparationReported) { preparationReported = true; preparedCallback.current?.('ready'); }
      } catch (error) {
        failed = true; state.error = String(error?.message || error); canvas.dataset.bgReady = 'false'; stop(); preparedCallback.current?.('fallback');
      }
    }
    function tick(timestamp) {
      frame = 0;
      if (!canRun()) { stop(); return; }
      const delta = previous ? Math.min(.05, Math.max(0, (timestamp - previous) / 1000)) : 0;
      previous = timestamp; time += delta; draw(delta);
      if (canRun()) { state.active = true; frame = requestAnimationFrame(tick); }
    }
    function paintAndRun() {
      draw();
      if (canRun() && !frame) { state.active = true; frame = requestAnimationFrame(tick); }
    }
    function resize() {
      const nextWidth = Math.max(1, canvas.parentElement.clientWidth), nextHeight = Math.max(1, canvas.parentElement.clientHeight), nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (width === nextWidth && height === nextHeight && dpr === nextDpr) return;
      width = nextWidth; height = nextHeight; dpr = nextDpr;
      canvas.width = mask.width = Math.round(width * dpr);
      canvas.height = mask.height = Math.round(height * dpr);
      scene.resize({ width, height, mobile: width <= 760 });
      state.width = width; state.height = height; state.dpr = dpr;
      maskDirty = true; paintAndRun();
    }
    function zonesChanged() { maskDirty = true; if (!canRun()) draw(); }
    function move(event) {
      if (event.pointerType === 'touch' || manualPause || reduced) return;
      desired.x = Math.max(-1, Math.min(1, event.clientX / width * 2 - 1));
      desired.y = Math.max(-1, Math.min(1, event.clientY / height * 2 - 1));
      desired.active = true;
    }
    function leave() { desired.x = desired.y = 0; desired.active = false; }
    function prepare() { maskDirty = true; draw(0, true); }
    function visibility() { leave(); if (document.hidden) stop(); else { maskDirty = true; if (preparationRequested.current) prepare(); paintAndRun(); } }
    function preference() {
      reduced = media.matches; state.reduced = reduced;
      pointer.x = pointer.y = desired.x = desired.y = 0; pointer.active = desired.active = false;
      stop(); onPreference?.(reduced); paintAndRun();
    }
    engineRef.current = { prepare, setPaused(value) { manualPause = value; state.paused = value; stop(); if (!value) paintAndRun(); } };
    const observer = new ResizeObserver(zonesChanged);
    for (const element of scope.querySelectorAll('.proposal-layout,.lab-title,.agent-intro__copy,[data-role-icon]')) observer.observe(element);
    const sceneElement = scope.querySelector('.proposal-layout');
    const intersection = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; state.inView = inView; if (inView) { maskDirty = true; paintAndRun(); } else stop(); });
    if (sceneElement) intersection.observe(sceneElement);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', zonesChanged, { passive: true, capture: true });
    if (mode !== 'c') {
      window.addEventListener('pointermove', move, { passive: true });
      document.documentElement.addEventListener('pointerleave', leave, { passive: true });
    }
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    state.reduced = reduced; onPreference?.(reduced);
    try { resize(); } catch (error) { failed = true; state.error = String(error?.message || error); stop(); preparedCallback.current?.('fallback'); }

    return () => {
      disposed = true; stop(); engineRef.current = null;
      observer.disconnect(); intersection.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', zonesChanged, true);
      if (mode !== 'c') {
        window.removeEventListener('pointermove', move);
        document.documentElement.removeEventListener('pointerleave', leave);
      }
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
      scene.dispose(); mask.width = mask.height = 0;
    };
  }, [mode, onPreference]);

  useEffect(() => { pausedRef.current = paused; engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { if (prepareStartup) engineRef.current?.prepare(); }, [prepareStartup]);
  return <div className="particle-backdrop" aria-hidden="true"><canvas ref={canvasRef} data-ambient-canvas data-background={mode} /></div>;
}
