
import { useEffect } from 'react';
import { AMY_SEQUENCE_DURATION } from '@/hooks/useAmyFrameSequence.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const AMY_END = 0.86;

export function useHeroScrollDampening({
  staticScene,
  paused,
  zoomed,
  videoAllowed,
  automaticIntroDone,
  runway,
  stage,
  introVideo,
  visible,
  cancelWheelScroll,
}) {
    useEffect(() => {
    if (staticScene || paused || zoomed || !videoAllowed || !automaticIntroDone) return;
    let wheelFrame = 0;
    let targetY = window.scrollY;
    let writtenY = window.scrollY;
    let lastTime = 0;
    let direction = 0;
    let pixelsPerSecond = 0;
    let stalledFrames = 0;

    const cancel = () => {
      cancelAnimationFrame(wheelFrame);
      wheelFrame = 0;
      lastTime = 0;
      direction = 0;
      stalledFrames = 0;
    };
    cancelWheelScroll.current = cancel;

    const step = (now) => {
      const dt = Math.min(32, lastTime ? now - lastTime : 16) / 1000;
      lastTime = now;
      const beforeY = window.scrollY;
      const remaining = targetY - beforeY;
      const eased = remaining * (1 - Math.exp(-dt / 0.10));
      const movement = clamp(eased, -pixelsPerSecond * dt, pixelsPerSecond * dt);
      window.scrollTo({ top: Math.abs(remaining) <= 1 ? targetY : beforeY + movement, behavior: 'instant' });
      writtenY = window.scrollY;
      stalledFrames = writtenY === beforeY ? stalledFrames + 1 : 0;
      // Browsers can round subpixel scroll requests; do not leave a RAF alive
      // forever when the final fraction of a pixel cannot be reached.
      if (Math.abs(targetY - writtenY) <= 1 || stalledFrames >= 2) {
        window.scrollTo({ top: targetY, behavior: 'instant' });
        writtenY = window.scrollY;
        cancel();
      } else wheelFrame = requestAnimationFrame(step);
    };

    const onWheel = (event) => {
      if (event.ctrlKey || event.defaultPrevented || !event.cancelable ||
          Math.abs(event.deltaX) >= Math.abs(event.deltaY) || document.hidden || !visible.current) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (!runway.current || !stage.current) return;

      const travel = runway.current.offsetHeight - stage.current.offsetHeight;
      const origin = window.scrollY + runway.current.getBoundingClientRect().top;
      const start = origin;
      const end = origin + travel * AMY_END;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.current.offsetHeight : 1);
      const y = window.scrollY;
      // At either boundary the next outward gesture returns to native scrolling.
      if (!wheelFrame && ((y <= start + 0.5 && delta < 0) || (y >= end - 0.5 && delta > 0))) return;
      const inside = y >= start && y <= end;
      const entering = delta > 0 ? y < start && y + delta >= start : y > end && y + delta <= end;
      if (!inside && !entering && !wheelFrame) return;

      event.preventDefault();
      if (!wheelFrame || Math.sign(delta) !== direction) {
        targetY = y;
        writtenY = y;
      }
      direction = Math.sign(delta);
      const introDuration = introVideo.current?.duration;
      const pixelsPerVideoSecond = travel * AMY_END /
        (Number.isFinite(introDuration) && introDuration > 0 ? introDuration : AMY_SEQUENCE_DURATION);
      pixelsPerSecond = pixelsPerVideoSecond * 0.7;
      const maxLead = pixelsPerVideoSecond * 0.25;
      const desired = entering && !wheelFrame
        ? (delta > 0 ? start + (y + delta - start) * 0.28 : end + (y + delta - end) * 0.28)
        : targetY + delta * 0.28;
      // A fast wheel burst cannot queue seconds of motion after the hand stops.
      targetY = clamp(clamp(desired, Math.min(y, start), Math.max(y, end)), y - maxLead, y + maxLead);
      if (!wheelFrame) wheelFrame = requestAnimationFrame(step);
    };

    const onScroll = () => {
      if (wheelFrame && Math.abs(window.scrollY - writtenY) > 2) cancel();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', cancel);
    window.addEventListener('pointerdown', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel();
      cancelWheelScroll.current = () => {};
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [staticScene, paused, zoomed, videoAllowed, automaticIntroDone]);

}
