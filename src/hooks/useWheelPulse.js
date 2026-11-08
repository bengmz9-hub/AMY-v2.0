import { useEffect } from 'react';

// A conservative packet heuristic, not a wheel/trackpad device detector.
// Native input always runs; only an isolated coarse packet gets a short extra pulse.
export function useWheelPulse(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0, frame = 0, candidate = null, motion = null, lastWheelAt = -Infinity, observedY = scrollY;

    function cancel(event) {
      if ((event?.type === 'blur' || event?.type === 'resize') && event.target !== window) return;
      clearTimeout(timer); cancelAnimationFrame(frame);
      timer = frame = 0; candidate = motion = null;
      observedY = scrollY;
    }
    function blocked(target, direction) {
      if (!fine.matches || reduced.matches || document.hidden || !target?.isConnected
        || document.getElementById('main')?.inert
        || document.querySelector('.startup-cover, .jj-navbar.menu-is-open, .amy-stage[data-zoomed="true"]')
        || ['hidden', 'clip'].includes(document.documentElement.style.overflow)
        || ['hidden', 'clip'].includes(document.body.style.overflow)
        || target.closest('input, textarea, select, [contenteditable]')) return true;
      for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        if (node.scrollHeight <= node.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
        if (direction < 0 ? node.scrollTop > 1 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
      }
      return false;
    }
    function limit() {
      const element = document.scrollingElement;
      return Math.max(0, element.scrollHeight - element.clientHeight);
    }
    function tick(now) {
      frame = 0;
      const active = motion;
      if (!active) return;
      if (blocked(active.target, active.direction) || Math.abs(scrollY - active.lastWritten) > 1) { cancel(); return; }
      const progress = Math.max(0, Math.min(1, (now - active.started) / 110));
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.max(0, Math.min(limit(), active.from + (active.to - active.from) * eased));
      scrollTo({ top: next, behavior: 'instant' });
      observedY = active.lastWritten = scrollY;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else motion = null;
    }
    function assist() {
      timer = 0;
      const input = candidate;
      candidate = null;
      if (!input || blocked(input.target, input.direction)) return;
      const nativeTravel = (scrollY - input.origin) * input.direction;
      // No extra motion for consumed/blocked input or an unrelated document jump.
      if (nativeTravel <= 0 || nativeTravel > Math.abs(input.delta) + 1) return;
      const extra = input.direction * Math.min(Math.abs(input.delta) * 2, 280);
      const from = scrollY, to = Math.max(0, Math.min(limit(), from + extra));
      if (to === from) return;
      motion = { from, to, target: input.target, direction: input.direction, started: performance.now(), lastWritten: from };
      frame = requestAnimationFrame(tick);
    }
    function wheel(event) {
      const now = performance.now(), gap = now - lastWheelAt, origin = observedY;
      lastWheelAt = now;
      cancel();
      const magnitude = Math.abs(event.deltaY), direction = Math.sign(event.deltaY);
      const target = event.target instanceof Element ? event.target : null;
      if (gap < 120 || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.deltaMode !== 0 || event.deltaX !== 0 || event.deltaZ !== 0 || !Number.isInteger(event.deltaY)
        || magnitude < 80 || magnitude > 240 || blocked(target, direction)) return;
      // Passive wheel delivery can follow compositor scrolling but precede its
      // scroll event. Compare against the last observed position in either order.
      candidate = { target, direction, delta: event.deltaY, origin };
      timer = setTimeout(assist, 70);
    }
    function scrolled() {
      if (motion && Math.abs(scrollY - motion.lastWritten) > 1) cancel();
      else if (candidate) {
        const travel = (scrollY - candidate.origin) * candidate.direction;
        if (travel < 0 || travel > Math.abs(candidate.delta) + 1) cancel();
      }
      observedY = scrollY;
    }

    addEventListener('wheel', wheel, { passive: true });
    addEventListener('scroll', scrolled, { passive: true });
    const interruptions = ['keydown', 'touchstart', 'touchmove', 'pointerdown', 'blur', 'resize', 'hashchange', 'popstate'];
    for (const name of interruptions) addEventListener(name, cancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', cancel);
    fine.addEventListener('change', cancel); reduced.addEventListener('change', cancel);
    return () => {
      cancel();
      removeEventListener('wheel', wheel); removeEventListener('scroll', scrolled);
      for (const name of interruptions) removeEventListener(name, cancel, true);
      document.removeEventListener('visibilitychange', cancel);
      fine.removeEventListener('change', cancel); reduced.removeEventListener('change', cancel);
    };
  }, [enabled]);
}
