import { useCallback, useEffect, useId, useRef, useState } from 'react';
import lens from '@/data/heroLens.json';
import AmySignature from '@/components/ui/AmySignature.jsx';
import useAmyFrameSequence, { AMY_SEQUENCE_DURATION } from '@/hooks/useAmyFrameSequence.js';
import './Hero.css';

const asset = (name) => `${import.meta.env.BASE_URL}assets/imagenes/${name}`;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const GAMEPLAY_HOLD_SECONDS = 1.2;
const GLASSES_PULLBACK_SECONDS = 2.3;
const AMY_END = 0.86;

const SAGE_COPY =
  'Main Sage en Platino 3. Dominio del control de terreno y soporte táctico en cada ronda.';
const BIO_COPY =
  'Soy AMY. Este es mi rincón de Valorant: clips y momentos dentro del juego.';
const BIO_WORDS = BIO_COPY.split(' ');

const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export default function Hero() {
  const id = `amy-${useId().replace(/[^a-z0-9-]/gi, '')}`;
  const runway = useRef(null);
  const stage = useRef(null);
  const wipeLayer = useRef(null);
  const plane = useRef(null);
  const gameplayVideo = useRef(null);
  const introVideo = useRef(null);
  const cinematicLayer = useRef(null);
  const aperture = useRef(null);
  const lensMaterial = useRef(null);
  const lensGlare = useRef(null);
  const lensTrigger = useRef(null);
  const zoomCloseBtn = useRef(null);
  const copy = useRef(null);
  const introOverlay = useRef(null);
  const clips = useRef(null);
  const sageCard = useRef(null);

  const visible = useRef(true);
  const redraw = useRef(() => {});
  const phaseRef = useRef('gameplay');
  const pausedRef = useRef(false);
  const zoomedRef = useRef(false);
  const diveRef = useRef(1); // Used when zoomed into glasses from settled state (1 = in glasses, 0 = fullscreen)
  const diveAnimRef = useRef(0);
  const savedScrollYRef = useRef(0);
  const automaticIntro = useRef({ progress: 0, complete: false });
  const gameplayResumeTime = useRef(0);
  const targetCinematicTimeRef = useRef(0);
  const scrubRafRef = useRef(0);
  const cancelWheelScroll = useRef(() => {});
  const signatureTriggeredRef = useRef(false);

  const [phase, setPhase] = useState('gameplay');
  const [automaticIntroDone, setAutomaticIntroDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualVideoRequested, setManualVideoRequested] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [signatureKey, setSignatureKey] = useState(0);
  const [status, setStatus] = useState('loading');
  const [portraitError, setPortraitError] = useState(false);

  useEffect(() => {
    if (status === 'ready' || status === 'error' || portraitError) {
      setTimeout(() => {
        window.dispatchEvent(new Event('amy-hero-ready'));
      }, 100);
    }
  }, [status, portraitError]);
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // Use .webm versions by default as requested; fallback to .mp4 only if .webm fails
  const [gameplayCodec, setGameplayCodec] = useState('av1');
  const [introCodec, setIntroCodec] = useState('av1');
  const [gameplayFailed, setGameplayFailed] = useState(false);
  const [introFailed, setIntroFailed] = useState(false);
  const [sequenceFailed, setSequenceFailed] = useState(false);
  const [sequenceReady, setSequenceReady] = useState(false);

  const gameplaySrc =
    gameplayCodec === 'av1'
      ? asset('valorant-gameplay-720p-av1.webm')
      : asset('valorant-gameplay-720p-h264.mp4');
  const introSrc =
    introCodec === 'av1'
      ? asset('amy-intro-720p-scrub-av1.webm')
      : asset('amy-intro-720p-scrub-h264.mp4');

  const staticScene = reduced || portraitError;
  const videoAllowed = (!reduced || manualVideoRequested) && !portraitError;

  const { canvasRef: introCanvas, requestFrame: requestCinematicFrame } = useAmyFrameSequence({
    enabled: !sequenceFailed && videoAllowed && !staticScene,
    canDraw: () => !pausedRef.current && !zoomedRef.current && visible.current && !staticScene,
    onReady: () => { setSequenceReady(true); setStatus('ready'); redraw.current(); },
    onError: () => { setSequenceFailed(true); setSequenceReady(false); },
  });

  const updatePhaseState = useCallback((nextPhase) => {
    if (phaseRef.current !== nextPhase) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      window.dispatchEvent(new CustomEvent('amy-hero-phase'));
    }
  }, []);

  const finishAutomaticIntro = useCallback(() => {
    automaticIntro.current = { progress: 1, complete: true };
    setAutomaticIntroDone(true);
    gameplayVideo.current?.pause();
    redraw.current();
  }, []);

  // Only AMY is scrubbed. Gameplay playback owns the clock of the automatic
  // opening; neither seeking nor scroll drives its video or camera.
  const syncCinematicScrub = useCallback(() => {
    scrubRafRef.current = 0;
    const gv = gameplayVideo.current;
    const iv = introVideo.current;
    if (!videoAllowed || pausedRef.current || document.hidden || !visible.current) {
      gv?.pause();
      iv?.pause();
      return;
    }
    if (staticScene) {
      gv?.pause();
      iv?.pause();
      return;
    }
    if (zoomedRef.current) {
      iv?.pause();
      return;
    }
    if (!sequenceFailed) {
      requestCinematicFrame(targetCinematicTimeRef.current);
      return;
    }
    if (!iv || introFailed) return;
    if (!iv.paused) iv.pause();
    const duration = Number.isFinite(iv.duration) ? iv.duration : 0;
    const target = clamp(targetCinematicTimeRef.current, 0, Math.max(0, duration - 0.04));
    if (iv.readyState >= 1 && !iv.seeking && Math.abs(target - iv.currentTime) > 0.035) {
      try {
        iv.currentTime = target;
      } catch {}
    }
  }, [introFailed, videoAllowed, staticScene, sequenceFailed, requestCinematicFrame]);

  const scheduleCinematicScrub = useCallback(() => {
    if (!scrubRafRef.current) {
      scrubRafRef.current = requestAnimationFrame(syncCinematicScrub);
    }
  }, [syncCinematicScrub]);

  // Sync reduced motion media query
  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      const isRed = motionQuery.matches;
      setReduced(isRed);
      if (isRed) {
        setManualVideoRequested(false);
        updatePhaseState('settled');
      }
      redraw.current();
    };
    motionQuery.addEventListener('change', updateMotion);
    return () => motionQuery.removeEventListener('change', updateMotion);
  }, [updatePhaseState]);

  useEffect(() => {
    pausedRef.current = paused;
    scheduleCinematicScrub();
  }, [paused, scheduleCinematicScrub]);

  // Read the playing video's clock so pause, buffering and visibility changes
  // also pause the camera. Completing the opening never changes document scroll.
  useEffect(() => {
    if (staticScene || !videoAllowed || automaticIntroDone) return;
    if (gameplayFailed) {
      finishAutomaticIntro();
      return;
    }
    let frame = 0;
    const tick = () => {
      if (automaticIntro.current.complete) return;
      const gv = gameplayVideo.current;
      if (gv && !gv.paused && !gv.seeking && !pausedRef.current && !document.hidden && visible.current) {
        automaticIntro.current.progress = clamp(
          (gv.currentTime - GAMEPLAY_HOLD_SECONDS) / GLASSES_PULLBACK_SECONDS
        );
        if (automaticIntro.current.progress >= 1) {
          finishAutomaticIntro();
          return;
        }
        redraw.current();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [staticScene, videoAllowed, automaticIntroDone, gameplayFailed, finishAutomaticIntro]);

  // Automatic gameplay -> automatic pullback -> AMY by scroll -> still portrait.
  useEffect(() => {
    let frame = 0;
    let metrics = null;

    const draw = () => {
      frame = 0;
      if (!metrics || !runway.current || !stage.current || !plane.current) return;
      const m = metrics;
      const isZoomed = zoomedRef.current;

      const travel = Math.max(1, runway.current.offsetHeight - stage.current.offsetHeight);
      const rawScroll = -runway.current.getBoundingClientRect().top;
      const requestedProgress = staticScene ? 1 : clamp(rawScroll / travel, 0, 1);
      const iv = introVideo.current;
      const dur = sequenceFailed && iv && Number.isFinite(iv.duration) && iv.duration > 0 ? iv.duration : AMY_SEQUENCE_DURATION;
      const cinematicProgress = clamp(requestedProgress / AMY_END);
      const progress = staticScene ? 1
        : !automaticIntro.current.complete ? automaticIntro.current.progress * (introFailed ? 0.72 : 0.21)
        : introFailed ? 1
        : requestedProgress <= AMY_END ? 0.21 + cinematicProgress * 0.51
        : 0.72 + ((requestedProgress - AMY_END) / (1 - AMY_END)) * 0.28;

      // Determine active scrollytelling phase from scroll progress
      let nextPhase = 'gameplay';
      if (staticScene || progress >= 0.09) {
        nextPhase = 'settled';
      }
      updatePhaseState(nextPhase);

      // Stage 1 + 2 camera dive (0 = fullscreen gameplay in lens opening, closeUpEase = matched to AMY 0.0s close-up glasses, 1.0 = final portrait)
      const startScale =
        Math.max(
          m.width / (lens.opening.width * m.ratio),
          m.height / (lens.opening.height * m.ratio)
        ) * 1.2;
      const glassesSvgW = lens.bounds.right - lens.bounds.left;
      const glassesSvgX = (lens.bounds.left + lens.bounds.right) * 0.5;
      const glassesSvgY = (lens.bounds.top + lens.bounds.bottom) * 0.5;

      const closeUpScale = Math.max(1.8, (0.565 * m.width) / (glassesSvgW * m.ratio));
      const closeUpEase = clamp(
        1 - Math.log(closeUpScale) / Math.log(startScale),
        0.35,
        0.78
      );

      const finalGlassesX = m.x + glassesSvgX * m.ratio;
      const finalGlassesY = m.y + glassesSvgY * m.ratio;
      const closeUpGlassesX = m.width * 0.492;
      const closeUpGlassesY = m.height * 0.445;

      // The completed portrait is a still background, including its glasses.

      let ease = 1;
      let t = 1;
      let anchorSvgX = glassesSvgX;
      let anchorSvgY = glassesSvgY;
      let baseCenterX = finalGlassesX;
      let baseCenterY = finalGlassesY;

      if (staticScene) {
        ease = 1;
        t = 1;
      } else if (isZoomed || diveAnimRef.current) {
        t = clamp(diveRef.current, 0, 1);
        ease = smoothstep(t);
        anchorSvgX = lens.focus.x + (glassesSvgX - lens.focus.x) * ease;
        anchorSvgY = lens.focus.y + (glassesSvgY - lens.focus.y) * ease;
        baseCenterX = m.width / 2 + (finalGlassesX - m.width / 2) * ease;
        baseCenterY = m.height / 2 + (finalGlassesY - m.height / 2) * ease;
      } else if (introFailed) {
        t = clamp((progress - 0.04) / 0.68, 0, 1);
        ease = smoothstep(t);
        anchorSvgX = lens.focus.x + (glassesSvgX - lens.focus.x) * ease;
        anchorSvgY = lens.focus.y + (glassesSvgY - lens.focus.y) * ease;
        baseCenterX = m.width / 2 + (finalGlassesX - m.width / 2) * ease;
        baseCenterY = m.height / 2 + (finalGlassesY - m.height / 2) * ease;
      } else if (progress <= 0.21) {
        const s1Raw = clamp((progress - 0.01) / 0.20, 0, 1);
        const s1 = smoothstep(s1Raw);
        t = s1Raw * closeUpEase;
        ease = s1 * closeUpEase;
        const anchorBlend = smoothstep(clamp((s1Raw - 0.18) / 0.82, 0, 1));
        anchorSvgX = lens.focus.x + (glassesSvgX - lens.focus.x) * anchorBlend;
        anchorSvgY = lens.focus.y + (glassesSvgY - lens.focus.y) * anchorBlend;
        baseCenterX = m.width / 2 + (closeUpGlassesX - m.width / 2) * s1;
        baseCenterY = m.height / 2 + (closeUpGlassesY - m.height / 2) * s1;
      } else {
        const s2Raw = clamp((progress - 0.21) / 0.47, 0, 1);
        const s2 = smoothstep(s2Raw);
        t = closeUpEase + s2Raw * (1 - closeUpEase);
        ease = closeUpEase + s2 * (1 - closeUpEase);
        anchorSvgX = glassesSvgX;
        anchorSvgY = glassesSvgY;
        baseCenterX = closeUpGlassesX + (finalGlassesX - closeUpGlassesX) * s2;
        baseCenterY = closeUpGlassesY + (finalGlassesY - closeUpGlassesY) * s2;
      }

      const scale = Math.exp(Math.log(startScale) * (1 - ease));
      const centerX = baseCenterX;
      const centerY = baseCenterY;
      const x = centerX - anchorSvgX * m.ratio * scale;
      const y = centerY - anchorSvgY * m.ratio * scale;

      plane.current.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
      const svgTransform = `translate(${x},${y}) scale(${m.ratio * scale})`;
      if (aperture.current) {
        aperture.current.setAttribute('transform', svgTransform);
      }
      if (lensMaterial.current) {
        lensMaterial.current.setAttribute('transform', svgTransform);
      }
      if (lensGlare.current) {
        lensGlare.current.setAttribute('transform', 'translate(0,0)');
      }

      const left = Math.max(0, Math.min(m.width, x + lens.bounds.left * m.ratio * scale));
      const top = Math.max(0, Math.min(m.height, y + lens.bounds.top * m.ratio * scale));
      const right = Math.max(0, Math.min(m.width, x + lens.bounds.right * m.ratio * scale));
      const bottom = Math.max(0, Math.min(m.height, y + lens.bounds.bottom * m.ratio * scale));
      const lensW = Math.max(1, right - left);
      const lensH = Math.max(1, bottom - top);

      if (gameplayVideo.current && gameplayVideo.current.parentElement) {
        gameplayVideo.current.parentElement.style.clipPath =
          t < 0.05 ? 'none' : `url(#${id}-lens-clip)`;
        Object.assign(gameplayVideo.current.style, {
          left: `${t < 0.05 ? 0 : left}px`,
          top: `${t < 0.05 ? 0 : top}px`,
          width: `${t < 0.05 ? m.width : lensW}px`,
          height: `${t < 0.05 ? m.height : lensH}px`,
          objectPosition: '50% 50%',
        });
      }

      if (lensTrigger.current) {
        const pad = 8;
        Object.assign(lensTrigger.current.style, {
          left: `${Math.max(0, left - pad)}px`,
          top: `${Math.max(0, top - pad)}px`,
          width: `${lensW + pad * 2}px`,
          height: `${lensH + pad * 2}px`,
        });
      }

      // Stage 1 -> Stage 2 -> Stage 3 fusion of the AMY shooting sequence.
      const fusionIn = smoothstep(clamp((progress - 0.11) / 0.10, 0, 1));
      const fusionOut = smoothstep(clamp((progress - 0.72) / 0.13, 0, 1));
      const cinematicReady = sequenceFailed ? iv && iv.readyState >= 2 : sequenceReady;
      const cinematicOpacity =
        staticScene || introFailed || isZoomed || !cinematicReady ? 0 : fusionIn * (1 - fusionOut);
      if (gameplayVideo.current?.parentElement) {
        gameplayVideo.current.parentElement.style.opacity =
          staticScene ? '0' : isZoomed ? '1' : (1 - fusionOut).toFixed(4);
      }
      const cinematicScale =
        progress <= 0.21 ? clamp(scale / closeUpScale, 1, 2.2) : 1;

      if (cinematicLayer.current) {
        cinematicLayer.current.style.opacity = cinematicOpacity.toFixed(4);
        cinematicLayer.current.style.visibility =
          cinematicOpacity > 0.005 ? 'visible' : 'hidden';
      }
      const cinematicSurface = introCanvas.current || introVideo.current;
      if (cinematicSurface) {
        cinematicSurface.style.transform = `scale(${cinematicScale.toFixed(4)})`;
      }

      targetCinematicTimeRef.current = cinematicProgress * dur;
      scheduleCinematicScrub();

      const lensSettle = clamp((ease - 0.25) / 0.75, 0, 1);
      const reveal = staticScene ? 1 : isZoomed ? 0 : smoothstep(clamp((progress - 0.1) / 0.15, 0, 1));
      const introFade = staticScene ? 1 : smoothstep(clamp((progress - 0.1) / 0.1, 0, 1));

      if (reveal > 0.55 && !signatureTriggeredRef.current) {
        signatureTriggeredRef.current = true;
      } else if (progress < 0.1 && signatureTriggeredRef.current) {
        signatureTriggeredRef.current = false;
        setSignatureKey((k) => k + 1);
      }

      stage.current.style.clipPath = 'none';
      stage.current.style.setProperty('--lens-settle', lensSettle.toFixed(4));
      stage.current.style.setProperty('--reveal', reveal.toFixed(4));
      stage.current.style.setProperty('--intro-fade', introFade.toFixed(4));
      stage.current.style.setProperty('--wipe', '0.0000');
      stage.current.dataset.phase = nextPhase;
      stage.current.dataset.progress = progress.toFixed(4);
      stage.current.dataset.requestedProgress = requestedProgress.toFixed(4);
      stage.current.dataset.cinematicTime = targetCinematicTimeRef.current.toFixed(4);
      stage.current.dataset.autoProgress = automaticIntro.current.progress.toFixed(4);
      stage.current.dataset.autoDone = String(automaticIntro.current.complete);
      stage.current.dataset.wipe = '0.0000';
      stage.current.dataset.scale = scale.toFixed(4);
      stage.current.dataset.introDone = String(reveal > 0.55);
      stage.current.dataset.zoomed = String(isZoomed);
      runway.current.dataset.wipe = '0.0000';
      runway.current.dataset.progress = progress.toFixed(4);

      const isSettled = nextPhase === 'settled';
      if (copy.current) {
        copy.current.inert = !(reveal > 0.25 && !isZoomed);
      }
      if (introOverlay.current) {
        introOverlay.current.inert = isSettled || isZoomed;
      }
      if (lensTrigger.current) {
        const shouldBeActive = isSettled && !isZoomed && !staticScene;
        lensTrigger.current.inert = !shouldBeActive;
        if (!shouldBeActive && document.activeElement === lensTrigger.current) {
          lensTrigger.current.blur();
        }
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redraw.current = schedule;

    const measure = () => {
      if (!stage.current || !plane.current) return;
      const scene = stage.current.getBoundingClientRect();
      const isMobilePortrait = scene.width <= 760 && scene.height > 520;
      const headroom = isMobilePortrait
        ? Math.round(Math.min(158, Math.max(118, scene.height * 0.175)))
        : 0;
      const availHeight = Math.max(240, scene.height - headroom);
      const ratio = Math.max(scene.width / lens.width, availHeight / lens.height);
      const width = lens.width * ratio;
      const height = lens.height * ratio;
      plane.current.style.width = `${width}px`;
      plane.current.style.height = `${height}px`;
      metrics = {
        width: scene.width,
        height: scene.height,
        ratio,
        x: (scene.width - width) / 2,
        y: headroom + (availHeight - height) / 2,
        headroom,
      };
      stage.current.style.setProperty('--mobile-headroom', `${headroom}px`);
      stage.current.dataset.cropped = String(metrics.x / ratio < -130);
      schedule();
    };

    const resize = new ResizeObserver(measure);
    resize.observe(stage.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    measure();

    return () => {
      redraw.current = () => {};
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = 0;
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
    };
  }, [staticScene, id, introFailed, sequenceFailed, sequenceReady, introCanvas, updatePhaseState, scheduleCinematicScrub, finishAutomaticIntro]);

  // Dampen wheel impulses only while scrubbing AMY. The opening uses no scroll.
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
      const eased = remaining * (1 - Math.exp(-dt / 0.25));
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
      pixelsPerSecond = pixelsPerVideoSecond * 1.5;
      const maxLead = travel * 0.15;
      const desired = entering && !wheelFrame
        ? (delta > 0 ? start + (y + delta - start) * 1.2 : end + (y + delta - end) * 1.2)
        : targetY + delta * 1.2;
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

  // Reload media elements only when falling back from AV1 WebM to H.264 MP4
  useEffect(() => {
    if (gameplayCodec === 'h264' && gameplayVideo.current) {
      gameplayVideo.current.load();
    }
  }, [gameplayCodec]);

  useEffect(() => {
    if (introCodec === 'h264' && introVideo.current) {
      introVideo.current.load();
    }
  }, [introCodec]);

  // One playback policy: gameplay plays during the automatic opening or an
  // explicit glasses view; AMY remains paused and receives scroll targets.
  useEffect(() => {
    const gv = gameplayVideo.current;
    const iv = introVideo.current;
    let active = true;

    const syncPlayback = () => {
      if (!gv) return;
      gv.muted = true;
      gv.defaultMuted = true;
      if (iv) {
        iv.muted = true;
        iv.defaultMuted = true;
      }

      iv?.pause();
      const cinematicReady = introFailed || (!sequenceFailed && sequenceReady) || (sequenceFailed && iv?.readyState >= 2);
      const shouldPlay = () => (zoomedRef.current || !automaticIntro.current.complete) &&
        videoAllowed && !staticScene && !pausedRef.current && !document.hidden && visible.current && !gameplayFailed;
      if (shouldPlay() && (zoomedRef.current || cinematicReady)) {
        gv.play().then(() => {
          if (active && !shouldPlay()) gv.pause();
        }).catch((error) => {
          if (active && shouldPlay() && error.name === 'NotAllowedError') {
            setStatus('blocked');
            setPaused(true);
          }
        });
      } else {
        gv.pause();
      }
      scheduleCinematicScrub();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        syncPlayback();
      },
      { threshold: 0.05 }
    );
    // Observe the visible stage, not the entire long scroll runway: in short
    // windows less than 5% of that runway can be visible even inside the Hero.
    if (stage.current) observer.observe(stage.current);
    document.addEventListener('visibilitychange', syncPlayback);
    gv?.addEventListener('loadeddata', syncPlayback);
    iv?.addEventListener('loadeddata', syncPlayback);
    syncPlayback();

    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      gv?.removeEventListener('loadeddata', syncPlayback);
      iv?.removeEventListener('loadeddata', syncPlayback);
      gv?.pause();
      iv?.pause();
    };
  }, [
    zoomed,
    reduced,
    manualVideoRequested,
    paused,
    videoAllowed,
    gameplaySrc,
    introSrc,
    gameplayFailed,
    introFailed,
    sequenceFailed,
    sequenceReady,
    automaticIntroDone,
    staticScene,
    scheduleCinematicScrub,
  ]);

  // Probe canonical portrait image so network failure triggers fallback reliably across browsers
  useEffect(() => {
    let active = true;
    const probe = new Image();
    probe.onload = () => {
      if (active) setPortraitError(false);
    };
    probe.onerror = () => {
      if (active) setPortraitError(true);
    };
    probe.src = asset('amy-hero-ultrawide-v2.png');
    return () => {
      active = false;
    };
  }, []);

  // Codec fallback handlers (AV1 WebM -> H.264 MP4 once -> error, preventing fallback loops)
  const onGameplayError = () => {
    if (gameplayCodec === 'av1') {
      gameplayResumeTime.current = gameplayVideo.current?.currentTime || 0;
      setGameplayCodec('h264');
      return;
    }
    setGameplayFailed(true);
    if (introFailed || phaseRef.current === 'settled') {
      setStatus('error');
    }
    redraw.current();
  };

  const onIntroError = () => {
    if (introCodec === 'av1') {
      setIntroCodec('h264');
      return;
    }
    setIntroFailed(true);
    if (gameplayFailed) {
      setStatus('error');
    }
    redraw.current();
  };

  // Interactive glasses re-entry (zoom to fullscreen Valorant view and back)
  const animateDive = useCallback((targetDive, durationMs, onDone) => {
    cancelAnimationFrame(diveAnimRef.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || durationMs <= 0) {
      diveRef.current = targetDive;
      redraw.current();
      onDone?.();
      return;
    }
    const startDive = diveRef.current;
    const startTime = performance.now();
    const step = (now) => {
      const p = clamp((now - startTime) / durationMs, 0, 1);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      diveRef.current = startDive + (targetDive - startDive) * eased;
      redraw.current();
      if (p < 1) {
        diveAnimRef.current = requestAnimationFrame(step);
      } else {
        diveAnimRef.current = 0;
        diveRef.current = targetDive;
        redraw.current();
        onDone?.();
      }
    };
    diveAnimRef.current = requestAnimationFrame(step);
  }, []);

  const openGlassesView = useCallback(() => {
    if (phaseRef.current !== 'settled' || zoomedRef.current || staticScene) return;
    savedScrollYRef.current = window.scrollY;
    zoomedRef.current = true;
    setZoomed(true);
    if (gameplayVideo.current) {
      try {
        gameplayVideo.current.currentTime = 0;
      } catch {}
    }
    if (pausedRef.current) {
      setPaused(false);
    }
    animateDive(0, 780, () => {
      requestAnimationFrame(() => {
        zoomCloseBtn.current?.focus({ preventScroll: true });
      });
    });
  }, [animateDive, staticScene]);

  const closeGlassesView = useCallback(() => {
    if (!zoomedRef.current) return;
    animateDive(1, 680, () => {
      zoomedRef.current = false;
      setZoomed(false);
      if (Math.abs(window.scrollY - savedScrollYRef.current) > 4) {
        window.scrollTo({ top: savedScrollYRef.current, behavior: 'instant' });
      }
      redraw.current();
      requestAnimationFrame(() => {
        lensTrigger.current?.focus({ preventScroll: true });
      });
    });
  }, [animateDive]);

  // Escape and downward wheel/swipe exit while in fullscreen glasses re-entry
  useEffect(() => {
    if (!zoomed) return;
    let touchStartY = null;
    let wheelAccum = 0;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeGlassesView();
      }
    };
    const onWheel = (e) => {
      if (!zoomedRef.current) return;
      if (e.deltaY > 0) {
        e.preventDefault();
        wheelAccum += e.deltaY;
        if (wheelAccum > 45) {
          wheelAccum = 0;
          closeGlassesView();
        }
      } else {
        wheelAccum = 0;
      }
    };
    const onTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e) => {
      if (touchStartY == null || !zoomedRef.current) return;
      const dy = touchStartY - (e.touches[0]?.clientY ?? touchStartY);
      if (dy > 40) {
        touchStartY = null;
        closeGlassesView();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [zoomed, closeGlassesView]);

  // Sage card fine-pointer tilt & rose holographic reflection
  const onSagePointerMove = (e) => {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const card = sageCard.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const rx = ((0.5 - ny) * 12).toFixed(2);
    const ry = ((nx - 0.5) * 14).toFixed(2);
    card.style.setProperty('--card-hover', '1');
    card.style.setProperty('--card-mxf', nx.toFixed(3));
    card.style.setProperty('--card-myf', ny.toFixed(3));
    card.style.setProperty('--card-rx', `${rx}deg`);
    card.style.setProperty('--card-ry', `${ry}deg`);
    card.style.setProperty('--card-scale', '1.03');
  };

  const onSagePointerLeave = () => {
    const card = sageCard.current;
    if (!card) return;
    card.style.setProperty('--card-hover', '0');
    card.style.setProperty('--card-rx', '0deg');
    card.style.setProperty('--card-ry', '0deg');
    card.style.setProperty('--card-scale', '1');
  };

  const skipIntro = () => {
    cancelWheelScroll.current();
    finishAutomaticIntro();
    if (!staticScene && runway.current && stage.current) {
      const travel = Math.max(1, runway.current.offsetHeight - stage.current.offsetHeight);
      const top = Math.max(
        0,
        window.scrollY + runway.current.getBoundingClientRect().top + travel * 0.96
      );
      window.scrollTo({ top, behavior: 'instant' });
    }
    updatePhaseState('settled');
    if (copy.current) copy.current.inert = false;
    if (introOverlay.current) introOverlay.current.inert = true;
    redraw.current();
    requestAnimationFrame(() => {
      if (copy.current) copy.current.inert = false;
      clips.current?.focus({ preventScroll: true });
    });
  };

  const replay = () => {
    cancelWheelScroll.current();
    cancelAnimationFrame(diveAnimRef.current);
    diveAnimRef.current = 0;
    zoomedRef.current = false;
    setZoomed(false);
    diveRef.current = 1;
    automaticIntro.current = { progress: 0, complete: false };
    setAutomaticIntroDone(false);
    gameplayResumeTime.current = 0;
    targetCinematicTimeRef.current = 0;
    requestCinematicFrame(0);
    signatureTriggeredRef.current = false;
    if (reduced) setManualVideoRequested(true);
    pausedRef.current = false;
    setPaused(false);
    setSignatureKey((k) => k + 1);
    if (gameplayVideo.current) {
      try {
        gameplayVideo.current.currentTime = 0;
      } catch {}
    }
    if (introVideo.current) {
      try {
        introVideo.current.currentTime = 0;
      } catch {}
    }
    if (runway.current) {
      const top = Math.max(0, window.scrollY + runway.current.getBoundingClientRect().top);
      window.scrollTo({ top, behavior: 'instant' });
    }
    updatePhaseState(portraitError ? 'settled' : 'gameplay');
    redraw.current();
  };

  const togglePause = () => {
    if (reduced && !manualVideoRequested) {
      setManualVideoRequested(true);
      setPaused(false);
      return;
    }
    setPaused((prev) => !prev);
  };

  const retry = () => {
    setGameplayFailed(false);
    setIntroFailed(false);
    setSequenceFailed(false);
    if (sequenceFailed) setSequenceReady(false);
    setGameplayCodec('av1');
    setIntroCodec('av1');
    setStatus('loading');
    if (reduced) setManualVideoRequested(true);
    setPaused(false);
    requestAnimationFrame(() => {
      gameplayVideo.current?.load();
      introVideo.current?.load();
      scheduleCinematicScrub();
    });
  };

  const isVideoPaused = paused || (reduced && !manualVideoRequested);

  return (
    <section
      ref={runway}
      className="amy-hero"
      id="amy"
      aria-labelledby="amy-hero-title"
      data-static={staticScene}
      data-phase={phase}
      data-paused={isVideoPaused}
      data-portrait-error={portraitError}
    >
      <h1 id="amy-hero-title" className="sr-only">
        AMY — Valorant · Main Sage
      </h1>

      <div ref={stage} className="amy-stage">
        <div className="amy-backdrop" aria-hidden="true">
          <div
            className="amy-backdrop-texture"
            style={{ backgroundImage: `url(${asset('amy-hero-texture.svg')})` }}
          />
          <span className="amy-backdrop-word">AMY</span>
        </div>

        <div ref={wipeLayer} className="amy-wipe-scale">
          <div className="amy-portrait-wrap">
            <div ref={plane} className="amy-portrait-plane">
              <svg
                className="amy-portrait"
                viewBox={`0 0 ${lens.width} ${lens.height}`}
                role="img"
                aria-label="AMY con gafas ámbar y chaqueta de cuero negro, integrada en un fondo gris perla con armas de Valorant en distintas direcciones"
              >
                <defs>
                  <filter
                    id={`${id}-face-blend`}
                    filterUnits="userSpaceOnUse"
                    x="808"
                    y="162"
                    width="278"
                    height="202"
                  >
                    <feGaussianBlur stdDeviation="3" />
                  </filter>
                  <filter
                    id={`${id}-neck-blend`}
                    filterUnits="userSpaceOnUse"
                    x="840"
                    y="364"
                    width="270"
                    height="344"
                  >
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                  <mask
                    id={`${id}-portrait-retouch`}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width={lens.width}
                    height={lens.height}
                  >
                    {/* Retouch only AMY; original glasses, features and tattoos stay underneath. */}
                    <path
                      fill="white"
                      stroke="white"
                      strokeWidth="32"
                      strokeLinejoin="round"
                      d="M956 20 C869 16 809 75 781 124 C737 201 720 277 692 357 C668 426 636 478 602 500 C552 542 526 621 502 700 L466 821 H1438 C1406 741 1376 660 1340 595 C1314 537 1284 500 1234 475 C1204 398 1189 286 1153 203 C1127 100 1082 20 1000 20 Z"
                    />
                    {/* Feather only the mask edges; keep the photo and facial features sharp. */}
                    <path
                      fill="black"
                      filter={`url(#${id}-face-blend)`}
                      d="M836 189 C888 177 1007 174 1051 188 Q1059 192 1061 209 Q1071 222 1059 233 L1056 258 Q1048 269 977 271 Q961 269 947 249 Q935 237 925 251 Q913 272 893 272 Q850 271 836 259 L832 233 Q823 222 833 211 Z"
                    />
                    <path
                      fill="black"
                      filter={`url(#${id}-face-blend)`}
                      d="M933 265 Q919 271 917 287 Q922 299 943 301 Q965 298 973 286 Q970 274 956 265 Z"
                    />
                    <ellipse
                      fill="black"
                      filter={`url(#${id}-face-blend)`}
                      cx="946"
                      cy="326"
                      rx="50"
                      ry="20"
                    />
                    <path
                      fill="black"
                      filter={`url(#${id}-neck-blend)`}
                      d="M893 382 L1027 382 L1048 462 L1085 523 L1086 583 L1045 672 L925 686 L871 617 L862 530 L887 472 Z"
                    />
                  </mask>
                </defs>
                {/* Seamless studio top extension for mobile headroom framing */}
                <svg
                  x="0"
                  y="-260"
                  width={lens.width}
                  height="262"
                  viewBox={`0 0 ${lens.width} 1`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <image
                    href={asset('amy-hero-ultrawide-v2.png')}
                    width={lens.width}
                    height={lens.height}
                  />
                </svg>
                <image
                  href={asset('amy-hero-ultrawide-v2.png')}
                  width={lens.width}
                  height={lens.height}
                  onError={() => setPortraitError(true)}
                />
                <image
                  href={asset('amy-hero-ultrawide-v4-refined.png')}
                  width={lens.width}
                  height={lens.height}
                  preserveAspectRatio="none"
                  mask={`url(#${id}-portrait-retouch)`}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </svg>
            </div>
          </div>

          <div className="amy-lens-screen" aria-hidden="true">
            <video
              ref={gameplayVideo}
              className="amy-lens-video"
              src={gameplaySrc}
              poster={asset('amy-hero-gameplay-flat-crt-poster.jpg')}
              muted
              loop={!automaticIntroDone || zoomed}
              playsInline
              preload="auto"
              tabIndex={-1}
              data-codec={gameplayCodec}
              onLoadedMetadata={() => {
                if (gameplayResumeTime.current > 0 && gameplayVideo.current) {
                  gameplayVideo.current.currentTime = gameplayResumeTime.current;
                  gameplayResumeTime.current = 0;
                }
                redraw.current();
              }}
              onLoadedData={() => { setStatus('ready'); redraw.current(); scheduleCinematicScrub(); }}
              onSeeked={scheduleCinematicScrub}
              onPlaying={() => setStatus('ready')}
              onError={onGameplayError}
            />
            <div className="amy-lens-shade" />
          </div>

          {/* Clipped lens contour shading & subtle oblique specular reflection */}
          <svg
            className="amy-lens-material"
            aria-hidden="true"
            style={{ clipPath: `url(#${id}-lens-clip)` }}
          >
            <defs>
              <filter
                id={`${id}-lens-edge-blur`}
                filterUnits="userSpaceOnUse"
                x="818"
                y="165"
                width="256"
                height="121"
              >
                <feGaussianBlur stdDeviation="2.8" />
              </filter>
              <linearGradient
                id={`${id}-lens-top-shade`}
                gradientUnits="userSpaceOnUse"
                x1="946"
                y1="185"
                x2="946"
                y2="266"
              >
                <stop offset="0" stopColor="#050407" stopOpacity="0.58" />
                <stop offset="0.3" stopColor="#050407" stopOpacity="0.14" />
                <stop offset="0.68" stopColor="#050407" stopOpacity="0" />
                <stop offset="1" stopColor="#050407" stopOpacity="0.34" />
              </linearGradient>
              <linearGradient
                id={`${id}-lens-glare`}
                gradientUnits="userSpaceOnUse"
                x1="862"
                y1="184"
                x2="994"
                y2="264"
              >
                <stop offset="0" stopColor="#fff4df" stopOpacity="0" />
                <stop offset="0.28" stopColor="#fff4df" stopOpacity="0.02" />
                <stop offset="0.44" stopColor="#fff7e8" stopOpacity="0.095" />
                <stop offset="0.6" stopColor="#fff4df" stopOpacity="0.02" />
                <stop offset="1" stopColor="#fff4df" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g ref={lensMaterial}>
              <path d={lens.aperture} fill={`url(#${id}-lens-top-shade)`} />
              <g ref={lensGlare}>
                <rect
                  x="830"
                  y="180"
                  width="232"
                  height="92"
                  fill={`url(#${id}-lens-glare)`}
                />
              </g>
              <path
                d={lens.aperture}
                fill="none"
                stroke="#050407"
                strokeOpacity="0.72"
                strokeWidth="10"
                filter={`url(#${id}-lens-edge-blur)`}
              />
            </g>
          </svg>

          <svg className="amy-lens-definition" aria-hidden="true">
            <defs>
              <clipPath id={`${id}-lens-clip`} clipPathUnits="userSpaceOnUse">
                <path ref={aperture} d={lens.aperture} />
              </clipPath>
            </defs>
          </svg>

          {/* Keep the original 720p cover/crop for AVIF frames and video fallback. */}
          <div ref={cinematicLayer} className="amy-intro-cinematic" aria-hidden="true">
            {!sequenceFailed ? (
              <canvas ref={introCanvas} className="amy-intro-video" width="1280" height="720" data-codec="avif" />
            ) : <video
              ref={introVideo}
              className="amy-intro-video"
              src={introSrc}
              muted
              playsInline
              preload="auto"
              tabIndex={-1}
              data-codec={introCodec}
              onLoadedMetadata={() => redraw.current()}
              onLoadedData={() => { setStatus('ready'); redraw.current(); scheduleCinematicScrub(); }}
              onSeeked={scheduleCinematicScrub}
              onPlaying={() => setStatus('ready')}
              onError={onIntroError}
            />}
          </div>

          {/* Accessible transparent trigger over the settled glasses for fullscreen Valorant re-entry */}
          <button
            ref={lensTrigger}
            type="button"
            className="amy-lens-trigger"
            aria-label="Ampliar vídeo de Valorant en las gafas de AMY"
            onClick={openGlassesView}
          />

          {/* Settled Hero content: two balanced narrow side columns on desktop; upper bio+signature row & compact Sage dock on mobile */}
          <div ref={copy} className="amy-reveal">
            <svg className="amy-valorant-margin" viewBox="24 88 114 664" aria-hidden="true" focusable="false">
              <defs>
                <filter id={`${id}-valorant-ink`} x="24" y="88" width="114" height="664" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  3 -3 0 0 -0.15" />
                </filter>
              </defs>
              <image href={asset('amy-hero-ultrawide-v2.png')} width={lens.width} height={lens.height} filter={`url(#${id}-valorant-ink)`} />
            </svg>

            <div className="amy-col-left">
              <a
                ref={(node) => {
                  clips.current = node;
                  sageCard.current = node;
                }}
                href="#shorts"
                className="amy-sage-card"
                aria-label="Sage, agente principal de AMY en Valorant — Ver clips"
                onPointerMove={onSagePointerMove}
                onPointerLeave={onSagePointerLeave}
              >
                <div className="amy-sage-tilt">
                  <div className="amy-sage-art">
                    <img
                      src={asset('sage-wallpaper.jpg')}
                      width="405"
                      height="728"
                      alt="Sage, el personaje principal de AMY en Valorant"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <div className="amy-sage-sheen" aria-hidden="true" />
                    <div className="amy-sage-holo" aria-hidden="true" />
                    <div className="amy-sage-meta">
                      <span className="amy-sage-tag">
                        <i aria-hidden="true" />
                        Sage · Main
                      </span>
                      <span className="amy-sage-cta">
                        Ver clips <span aria-hidden="true">↗</span>
                      </span>
                    </div>
                  </div>
                </div>
              </a>
              <p className="amy-col-copy">{SAGE_COPY}</p>
            </div>

            <aside className="amy-col-right" aria-label="Conoce a AMY">
              <div className="amy-signature-wrap">
                <AmySignature
                  key={signatureKey}
                  id={`${id}-signature`}
                  src={asset('amy-signature-alpha.png')}
                />
              </div>
              <p className="amy-bio-text">
                <span className="sr-only">{BIO_COPY}</span>
                <span className="amy-bio-visual" aria-hidden="true">
                  {BIO_WORDS.map((word, index) => (
                    <span
                      key={index}
                      className="amy-bio-word"
                      style={{ '--word-index': index }}
                    >
                      {word}
                      {index < BIO_WORDS.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </span>
              </p>
            </aside>
          </div>
        </div>

        {/* Intro peripheral bar (active only during gameplay / cinematic / crossfade) */}
        <div ref={introOverlay} className="amy-intro-bar">
          <div className="amy-intro-meta">
            <span className="amy-intro-brand">
              AMY <span>/ VALORANT</span>
            </span>
            <span className="amy-intro-phase-label">
              {!automaticIntroDone ? 'Conoce a AMY' : 'Desliza para conocer a AMY ↓'}
            </span>
          </div>
          <div className="amy-intro-actions">
            <button className="amy-skip" type="button" onClick={skipIntro}>
              Saltar intro ↘
            </button>
            <button
              className="amy-pause-btn"
              type="button"
              onClick={togglePause}
              aria-pressed={isVideoPaused}
            >
              {isVideoPaused ? 'Reanudar vídeos' : 'Pausar vídeos'}
            </button>
            <a href="#shorts" className="amy-intro-link">
              Ver clips <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        {/* Settled peripheral controls (bottom-right, clear of portrait and side columns) */}
        <div
          className="amy-controls"
          inert={phase !== 'settled' || zoomed ? true : undefined}
        >
          <button className="amy-replay" type="button" onClick={replay}>
            Repetir intro ↺
          </button>
        </div>

        {/* Fullscreen Glasses Re-entry overlay controls */}
        <div className="amy-zoom-overlay" inert={!zoomed ? true : undefined}>
          <div className="amy-zoom-top">
            <button
              ref={zoomCloseBtn}
              type="button"
              className="amy-zoom-close"
              onClick={closeGlassesView}
              aria-label="Cerrar vista ampliada y volver al retrato de AMY"
            >
              Volver al retrato <span aria-hidden="true">✕</span>
            </button>
            <button
              type="button"
              className="amy-pause-btn"
              onClick={togglePause}
              aria-pressed={isVideoPaused}
            >
              {isVideoPaused ? 'Reanudar vídeos' : 'Pausar vídeos'}
            </button>
          </div>
          <p className="amy-zoom-hint" aria-hidden="true">
            Desliza hacia abajo o pulsa Esc para volver ↓
          </p>
        </div>

        {(status === 'error' || status === 'blocked' || portraitError) && (
          <div className="amy-media-notice" role="status">
            <p>
              {portraitError
                ? 'No se pudo cargar el retrato. Los clips y secciones siguen disponibles.'
                : status === 'error'
                  ? 'El vídeo no está disponible. Puedes continuar con AMY y sus clips.'
                  : 'Reproducción automática en pausa. Pulsa para activar el vídeo sin sonido.'}
            </p>
            {!portraitError && (
              <button type="button" onClick={retry}>
                {status === 'error' ? 'Reintentar vídeo' : 'Reproducir vídeo'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
