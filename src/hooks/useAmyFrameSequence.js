import { useCallback, useEffect, useRef } from 'react';

const FRAME_COUNT = 236;
const FPS = 24;
export const AMY_SEQUENCE_DURATION = FRAME_COUNT / FPS;

// Only the current frame and a small window around it stay decoded.
// The browser's HTTP cache can retain compressed AVIF files independently.
export default function useAmyFrameSequence({ enabled, canDraw, onReady, onError }) {
  const canvasRef = useRef(null);
  const controller = useRef(null);
  const targetRef = useRef(0);
  const callbacks = useRef({ canDraw, onReady, onError });
  callbacks.current = { canDraw, onReady, onError };

  const requestFrame = useCallback((time) => {
    const index = Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(time * FPS)));
    targetRef.current = index;
    controller.current?.request(index);
  }, []);

  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof createImageBitmap !== 'function') {
      callbacks.current.onError();
      return;
    }
    const cache = new Map();
    const pending = new Map();
    let wanted = [];
    let target = targetRef.current;
    let direction = 1;
    let drawn = -1;
    let ready = false;
    let disposed = false;
    let failed = false;

    const canPaint = () => !disposed && !failed && !document.hidden && callbacks.current.canDraw();
    const paint = () => {
      const bitmap = cache.get(target);
      if (!bitmap || drawn === target || !canPaint()) return;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      drawn = target;
      canvas.dataset.frame = String(target + 1);
      canvas.dataset.drawTime = performance.now().toFixed(1);
      if (!ready) {
        ready = true;
        callbacks.current.onReady();
      }
    };

    const pump = () => {
      if (!canPaint()) return;
      while (pending.size < 4) {
        const index = wanted.find((n) => !cache.has(n) && !pending.has(n));
        if (index === undefined) break;
        const abort = new AbortController();
        pending.set(index, abort);
        const name = String(index + 1).padStart(6, '0');
        fetch(`${import.meta.env.BASE_URL}assets/imagenes/amy-intro-avif/frame_${name}.avif`, { signal: abort.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`AMY frame ${index + 1}: ${response.status}`);
            return response.blob();
          })
          .then((blob) => createImageBitmap(blob))
          .then((bitmap) => {
            if (disposed || failed || abort.signal.aborted || !wanted.includes(index)) {
              bitmap.close();
              return;
            }
            cache.set(index, bitmap);
            canvas.dataset.cachedFrames = String(cache.size);
            paint();
          })
          .catch(() => {
            if (disposed || failed || abort.signal.aborted) return;
            failed = true;
            callbacks.current.onError();
          })
          .finally(() => {
            if (pending.get(index) === abort) pending.delete(index);
            pump();
          });
      }
    };

    const request = (index) => {
      if (index !== target) direction = Math.sign(index - target);
      target = index;
      canvas.dataset.targetFrame = String(target + 1);
      // 12 frames ahead, four behind, and the target: at most 17 bitmaps.
      wanted = [target];
      for (let distance = 1; distance <= 12; distance++) {
        wanted.push(target + distance * direction);
        if (distance <= 4) wanted.push(target - distance * direction);
      }
      wanted = wanted.filter((n) => n >= 0 && n < FRAME_COUNT);
      const wantedSet = new Set(wanted);
      for (const [n, bitmap] of cache) {
        if (!wantedSet.has(n)) {
          bitmap.close();
          cache.delete(n);
        }
      }
      for (const [n, abort] of pending) {
        if (!wantedSet.has(n)) {
          pending.delete(n);
          abort.abort();
        }
      }
      canvas.dataset.cachedFrames = String(cache.size);
      paint();
      pump();
    };

    controller.current = { request };
    request(target);
    return () => {
      disposed = true;
      controller.current = null;
      for (const abort of pending.values()) abort.abort();
      for (const bitmap of cache.values()) bitmap.close();
      pending.clear();
      cache.clear();
    };
  }, [enabled]);

  return { canvasRef, requestFrame };
}
