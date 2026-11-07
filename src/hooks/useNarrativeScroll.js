import { useEffect } from 'react';
import { createNebulosaLayout, HERO_DWELL_FALLBACK } from '@/components/scenes/nebulosa/phases.js';

// A short gesture starts one complete narrative move on the native document.
// Scenes still share scrollY; another gesture is needed after each settled scene.
export function useNarrativeScroll() {
  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, motion = null, lastWritten = scrollY, touch = null;
    let intent = 0, intentAt = 0, lastWheelAt = -Infinity, awaitWheelQuiet = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    function cancel(event) {
      if (event?.type === 'resize' && event.target !== window) return;
      cancelAnimationFrame(frame); frame = 0; motion = null;
      intent = 0; intentAt = 0; touch = null; awaitWheelQuiet = false;
      lastWritten = scrollY;
    }
    function blocked(forward, fromTouch = false) {
      if (reduced.matches || document.hidden || document.getElementById('main')?.inert
        || document.documentElement.style.overflow === 'hidden'
        || document.body.style.overflow === 'hidden'
        || document.querySelector('.amy-stage[data-zoomed="true"]')) return true;
      if (!forward || !document.querySelector('a.nebulosa-social[data-link-active="true"]')) return false;
      const focused = document.querySelector('a.nebulosa-social[aria-hidden="false"]:focus-visible');
      const hovered = !fromTouch && fine.matches && document.querySelector('.nebulosa-social[aria-hidden="false"]:hover');
      return [focused, hovered].some(element => element && !element.closest('[inert]'));
    }
    function landmarks() {
      const hero = document.querySelector('.amy-hero'), stage = hero?.querySelector('.amy-stage');
      const chapter = document.getElementById('nebulosa-chapter');
      if (!hero || !stage || !chapter) return [];
      const css = getComputedStyle(hero), height = innerHeight;
      const dwell = Number(css.getPropertyValue('--hero-dwell')) || HERO_DWELL_FALLBACK;
      const layout = createNebulosaLayout(dwell), rect = chapter.getBoundingClientRect();
      const start = scrollY + rect.top, end = start + rect.height - height;
      const heroTop = scrollY + hero.getBoundingClientRect().top;
      const travel = stage.offsetHeight * Number(css.getPropertyValue('--hero-transition'));
      const zones = [{ label: 'Inicio', start: 0, stop: 0 }];
      if (hero.dataset.static !== 'true') zones.push({ label: 'Hero', start: heroTop + travel,
        stop: heroTop + travel + stage.offsetHeight * dwell - 2 });
      zones.push({ label: 'Carrusel', start, stop: start + layout.distances.flowHold[1] * height - 2 },
        { label: 'Amy', start: start + layout.distances.hold[0] * height,
          stop: start + layout.distances.hold[1] * height - 2 },
        { label: 'Sobre Amy', start: end - 1, stop: end });
      return zones.filter((zone, i) => i === 0 || zone.stop > zones[i - 1].stop);
    }
    function destination(direction, zones) {
      const y = scrollY;
      const inside = zones.findIndex(zone => y >= zone.start - 2 && y <= zone.stop + 2);
      if (inside >= 0) return zones[inside + direction] || null;
      if (direction > 0) return zones.find(zone => zone.stop > y + 2) || null;
      return [...zones].reverse().find(zone => zone.stop < y - 2) || null;
    }
    // Constant travel through the middle, with short soft acceleration/deceleration.
    function ease(progress) {
      const edge = .12;
      if (progress < edge) return progress * progress / (2 * edge * (1 - edge));
      if (progress > 1 - edge) return 1 - (1 - progress) ** 2 / (2 * edge * (1 - edge));
      return (progress - edge / 2) / (1 - edge);
    }
    function tick(now) {
      frame = 0;
      if (!motion) return;
      if (blocked(motion.direction > 0, motion.fromTouch) || Math.abs(scrollY - lastWritten) > 2) { cancel(); return; }
      const progress = clamp((now - motion.started) / motion.duration, 0, 1);
      scrollTo({ top: motion.from + (motion.to - motion.from) * ease(progress), behavior: 'instant' });
      lastWritten = scrollY;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        scrollTo({ top: motion.to, behavior: 'instant' }); lastWritten = scrollY;
        motion = null; intent = 0; awaitWheelQuiet = true;
      }
    }
    function requestMove(delta, now, threshold, fromTouch) {
      const direction = Math.sign(delta);
      if (!direction || (motion && direction === motion.direction)) { intent = 0; return false; }
      if (now - intentAt > 180 || Math.sign(intent) !== direction) intent = 0;
      intent += delta; intentAt = now;
      if (Math.abs(intent) < threshold) return false;
      const next = destination(direction, landmarks()); intent = 0;
      if (!next) return false;
      cancelAnimationFrame(frame);
      motion = { from: scrollY, to: next.stop, label: next.label, direction, fromTouch,
        started: now, duration: clamp(Math.abs(next.stop - scrollY) / innerHeight * 575, 450, 3900) };
      lastWritten = scrollY; frame = requestAnimationFrame(tick);
      return true;
    }
    function nestedScroll(element, direction) {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (node.scrollHeight <= node.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
        if (direction < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
      }
      return false;
    }
    const editable = target => Boolean(target?.closest?.('input, textarea, select, [contenteditable]'));
    function inNarrative() {
      const zones = landmarks();
      return zones.length > 1 && scrollY >= -.5 && scrollY <= zones[zones.length - 1].stop + 1;
    }
    function wheel(event) {
      const direction = Math.sign(event.deltaY), now = performance.now();
      if (event.deltaX === 0 && event.deltaY === 0) return;
      if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
        || blocked(direction > 0) || !inNarrative()
        || editable(event.target) || nestedScroll(event.target instanceof Element ? event.target : null, direction)) { cancel(); return; }
      const horizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
      const tinyPixels = event.deltaMode === 0 && Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) <= 8;
      if (horizontal && !tinyPixels) { cancel(); return; }
      const fresh = now - lastWheelAt > 180; lastWheelAt = now;
      if (awaitWheelQuiet && !fresh) { event.preventDefault(); return; }
      if (fresh) { awaitWheelQuiet = false; intent = 0; }
      if (horizontal) {
        if (motion) event.preventDefault();
        else cancel();
        return;
      }
      if (!motion && !destination(direction, landmarks())) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? innerHeight : 1;
      requestMove(event.deltaY * unit, now, 20, false);
    }
    function touchStart(event) {
      if (event.touches.length !== 1 || editable(event.target) || event.target?.closest?.('button')) { cancel(); return; }
      if (event.target?.closest?.('a')) cancel();
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, lastY: point.clientY, used: false, target: event.target };
      intent = 0; awaitWheelQuiet = false;
    }
    function touchMove(event) {
      if (!touch || event.touches.length !== 1) return;
      const point = event.touches[0], x = point.clientX - touch.x, y = touch.y - point.clientY;
      if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
      if (Math.abs(x) >= Math.abs(y) || !event.cancelable || blocked(y > 0, true) || !inNarrative()
        || nestedScroll(touch.target instanceof Element ? touch.target : null, Math.sign(y))) { cancel(); return; }
      if (touch.used && !motion) { event.preventDefault(); return; }
      if (!motion && !destination(Math.sign(y), landmarks())) return;
      event.preventDefault();
      const delta = touch.lastY - point.clientY; touch.lastY = point.clientY;
      if (!touch.used) {
        const started = requestMove(delta, performance.now(), 30, true);
        if (started || (motion && Math.sign(delta) === motion.direction)) touch.used = true;
      }
    }
    const touchEnd = () => { touch = null; intent = 0; };
    const pointerDown = event => {
      if (event.pointerType === 'mouse' || editable(event.target) || event.target?.closest?.('a, button')) cancel();
    };
    const nativeScroll = () => { if (motion && Math.abs(scrollY - lastWritten) > 2) cancel(); };
    addEventListener('wheel', wheel, { passive: false });
    addEventListener('touchstart', touchStart, { passive: true });
    addEventListener('touchmove', touchMove, { passive: false });
    addEventListener('touchend', touchEnd, { passive: true });
    addEventListener('pointerdown', pointerDown, { capture: true, passive: true });
    addEventListener('scroll', nativeScroll, { passive: true });
    for (const name of ['keydown', 'click', 'blur', 'resize', 'touchcancel']) addEventListener(name, cancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', cancel); reduced.addEventListener('change', cancel);
    if (import.meta.env.DEV) window.amyScrollReview = { getState: () => ({ active: Boolean(motion),
      target: motion?.to ?? scrollY, current: scrollY, destination: motion?.label ?? null, awaitingQuiet: awaitWheelQuiet,
      landmarks: landmarks(), limit: landmarks().at(-1)?.stop ?? 0 }) };
    return () => {
      cancel(); removeEventListener('wheel', wheel); removeEventListener('scroll', nativeScroll);
      removeEventListener('touchstart', touchStart); removeEventListener('touchmove', touchMove); removeEventListener('touchend', touchEnd);
      removeEventListener('pointerdown', pointerDown, true);
      for (const name of ['keydown', 'click', 'blur', 'resize', 'touchcancel']) removeEventListener(name, cancel, true);
      document.removeEventListener('visibilitychange', cancel); reduced.removeEventListener('change', cancel);
      delete window.amyScrollReview;
    };
  }, []);
}
