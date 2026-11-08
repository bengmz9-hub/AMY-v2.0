import { useEffect } from 'react';
import { createNebulosaLayout, HERO_DWELL_FALLBACK } from '@/components/scenes/nebulosa/phases.js';

// Desktop screen journey. The existing scenes still render scrollY.
export function useScreenSteps(enabled = false) {
  useEffect(() => {
    if (!enabled) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, motion = null, lastWritten = scrollY;
    let lastWheel = -Infinity, lastDirection = 0, used = false, intent = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const pageTop = element => {
      let top = 0;
      for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
      return top;
    };
    function cancel(event) {
      if ((event?.type === 'resize' || event?.type === 'blur') && event.target !== window) return;
      cancelAnimationFrame(frame); frame = 0; motion = null;
      intent = 0; used = false; lastWritten = scrollY;
    }
    function blocked() {
      return !fine.matches || reduced.matches || document.hidden || document.getElementById('main')?.inert
        || document.querySelector('.startup-cover, .jj-navbar.menu-is-open, .amy-stage[data-zoomed="true"]')
        || ['hidden', 'clip'].includes(document.documentElement.style.overflow)
        || ['hidden', 'clip'].includes(document.body.style.overflow);
    }
    function nested(target, direction) {
      for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        if (node.scrollHeight <= node.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
        if (direction < 0 ? node.scrollTop > 1 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
      }
      return false;
    }
    function landmarks() {
      const hero = document.querySelector('.amy-hero'), stage = hero?.querySelector('.amy-stage');
      const chapter = document.getElementById('nebulosa-chapter');
      if (!hero || !stage || !chapter) return [];
      const css = getComputedStyle(hero), height = innerHeight;
      const dwell = Number(css.getPropertyValue('--hero-dwell')) || HERO_DWELL_FALLBACK;
      const layout = createNebulosaLayout(dwell), start = pageTop(chapter);
      const heroStart = pageTop(hero) + stage.offsetHeight * Number(css.getPropertyValue('--hero-transition'));
      const maximum = document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight;
      const phase = (label, range) => ({ label, start: start + range[0] * height, end: start + range[1] * height });
      return [
        { label: 'Gameplay', start: 0, end: 0 },
        { label: 'Hero', start: heroStart, end: heroStart + stage.offsetHeight * dwell },
        phase('Hélice', layout.distances.flowHold),
        { ...phase('AMY', layout.distances.hold), beats: [
          { y: start + layout.distances.birth[1] * height, time: 1000 },
          { y: start + layout.distances.field[1] * height, time: 2100 },
          { y: start + layout.distances.amy[1] * height, time: 4000 },
        ] },
        { label: 'Setup', start: maximum, end: maximum },
      ].map(zone => ({ ...zone, target: clamp((zone.start + zone.end) / 2, 0, maximum) }));
    }
    function tick(now) {
      frame = 0;
      const active = motion;
      if (!active) return;
      if (blocked() || Math.abs(scrollY - lastWritten) > 2) { cancel(); return; }
      const elapsed = Math.min(now - active.started, active.duration);
      const segment = active.path?.find(part => elapsed <= part.end) || active.path?.at(-1) || active;
      const t = clamp((elapsed - (segment.start || 0)) / segment.duration, 0, 1);
      // Hermite: preserve same-direction velocity when a fresh gesture retargets.
      const distance = segment.to - segment.from, tangent = segment.velocity * segment.duration;
      const endTangent = (segment.endVelocity || 0) * segment.duration;
      const offset = distance * (3 * t * t - 2 * t * t * t) + tangent * (t * t * t - 2 * t * t + t) + endTangent * (t * t * t - t * t);
      active.currentVelocity = distance * (6 * t - 6 * t * t) / segment.duration + segment.velocity * (3 * t * t - 4 * t + 1) + (segment.endVelocity || 0) * (3 * t * t - 2 * t);
      scrollTo({ top: segment.from + offset, behavior: 'instant' }); lastWritten = scrollY;
      if (elapsed < active.duration) frame = requestAnimationFrame(tick);
      else { scrollTo({ top: active.to, behavior: 'instant' }); lastWritten = scrollY; motion = null; }
    }
    function nebulaPath(zones, from, to, velocity) {
      const helix = zones.find(zone => zone.label === 'Hélice');
      const amy = zones.find(zone => zone.label === 'AMY');
      if (!helix || !amy || ![helix.target, amy.target].includes(to)
        || from >= amy.target + 2 || (to === helix.target && from <= helix.target + 2)) return null;
      const beats = [{ y: helix.target, time: 0 }, ...amy.beats, { y: amy.target, time: 4800 }];
      function timeAt(y) {
        if (y <= beats[0].y) return 0;
        for (let i = 1; i < beats.length; i++) if (y <= beats[i].y) {
          const a = beats[i - 1], b = beats[i];
          return a.time + (b.time - a.time) * (y - a.y) / (b.y - a.y);
        }
        return 4800;
      }
      const direction = Math.sign(to - from), origin = timeAt(from);
      const points = [{ y: from, time: 0 }, ...beats.filter(beat => Math.abs(beat.time - origin) > 1 && direction * (beat.y - from) > 1 && direction * (to - beat.y) > 1)
        .sort((a, b) => direction * (a.y - b.y)).map(beat => ({ y: beat.y, time: Math.abs(beat.time - origin) })),
        { y: to, time: Math.abs(timeAt(to) - origin) }];
      if (points.at(-1).time < 100) return null;
      const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.time - points[i].time));
      const speeds = points.map((point, i) => i === 0 ? direction * Math.min(Math.abs(velocity), Math.abs(slopes[0]) * 2)
        : i === points.length - 1 ? 0 : 2 * slopes[i - 1] * slopes[i] / (slopes[i - 1] + slopes[i]));
      return points.slice(1).map((point, i) => ({ from: points[i].y, to: point.y, start: points[i].time, end: point.time,
        duration: point.time - points[i].time, velocity: speeds[i], endVelocity: speeds[i + 1] }));
    }
    function move(direction) {
      const zones = landmarks();
      const reversing = motion && direction !== motion.direction;
      let index;
      if (motion && !reversing) index = motion.index + direction;
      else {
        const inside = zones.findIndex(zone => scrollY >= zone.start - 2 && scrollY <= zone.end + 2);
        index = inside >= 0 ? inside + (reversing ? 0 : direction) : direction > 0
          ? zones.findIndex(zone => zone.target > scrollY + 2)
          : zones.findLastIndex(zone => zone.target < scrollY - 2);
      }
      if (index < 0 || index >= zones.length) return false;
      const from = scrollY, target = zones[index].target;
      // Reverse toward a reached scene, even if earlier gestures chained past
      // an unvisited target. Never move forward to its center on an up gesture.
      const to = reversing ? direction > 0 ? Math.max(from, target) : Math.min(from, target) : target;
      if (Math.abs(to - from) <= 1) { cancel(); return true; }
      const duration = 620 + Math.min(3, Math.abs(to - from) / innerHeight) * 70;
      const velocity = motion && Math.sign(motion.currentVelocity) === direction
        ? direction * Math.min(Math.abs(motion.currentVelocity), Math.abs(to - from) * 2.5 / duration) : 0;
      cancelAnimationFrame(frame);
      motion = { from, to, index, direction, duration, velocity, currentVelocity: velocity, started: performance.now() };
      motion.path = nebulaPath(zones, from, to, velocity);
      if (motion.path) motion.duration = motion.path.at(-1).end;
      lastWritten = scrollY; frame = requestAnimationFrame(tick);
      return true;
    }
    function wheel(event) {
      const now = performance.now(), gap = now - lastWheel, direction = Math.sign(event.deltaY);
      lastWheel = now;
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || !event.cancelable || !target || !direction || blocked()
        || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        || target.closest('input, textarea, select, [contenteditable]')) { cancel(); return; }
      if (gap > 160 || direction !== lastDirection) { used = false; intent = 0; }
      lastDirection = direction;
      const zones = landmarks();
      if (!motion && ((direction < 0 && scrollY <= 1) || (direction > 0 && scrollY >= zones.at(-1)?.target - 1))) return;
      // An already-owned burst stays with its step as a new panel enters under
      // the pointer. A fresh gesture inside that panel remains native.
      if (used) { event.preventDefault(); return; }
      if (nested(target, direction)) { cancel(); return; }
      event.preventDefault();
      intent += event.deltaY * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? innerHeight : 1);
      if (Math.abs(intent) >= 20) { used = move(direction); intent = 0; }
    }
    function key(event) {
      const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
      if (!direction || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || blocked()
        || event.target?.closest?.('a, button, input, textarea, select, [contenteditable]')
        || nested(event.target instanceof Element ? event.target : null, direction)) { cancel(); return; }
      event.preventDefault();
      if (!event.repeat) move(direction);
    }
    function scroll() { if (motion && Math.abs(scrollY - lastWritten) > 2) cancel(); }
    addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', key);
    addEventListener('scroll', scroll, { passive: true });
    const interruptions = ['pointerdown', 'touchstart', 'blur', 'resize', 'hashchange', 'popstate'];
    for (const name of interruptions) addEventListener(name, cancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', cancel);
    fine.addEventListener('change', cancel); reduced.addEventListener('change', cancel);
    return () => {
      cancel(); removeEventListener('wheel', wheel); removeEventListener('keydown', key); removeEventListener('scroll', scroll);
      for (const name of interruptions) removeEventListener(name, cancel, true);
      document.removeEventListener('visibilitychange', cancel);
      fine.removeEventListener('change', cancel); reduced.removeEventListener('change', cancel);
    };
  }, [enabled]);
}
