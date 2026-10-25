
import { useEffect } from 'react';
import lens from '@/data/heroLens.json';
import { AMY_SEQUENCE_DURATION } from '@/hooks/useAmyFrameSequence.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const AMY_END = 0.86;

export function useHeroAnimation({
  staticScene,
  introFailed,
  sequenceFailed,
  sequenceReady,
  id,
  runway,
  stage,
  plane,
  introVideo,
  introCanvas,
  gameplayVideo,
  cinematicLayer,
  aperture,
  lensMaterial,
  lensGlare,
  lensTrigger,
  copy,
  introOverlay,
  zoomedRef,
  automaticIntro,
  diveAnimRef,
  diveRef,
  targetCinematicTimeRef,
  signatureTriggeredRef,
  redraw,
  scrubRafRef,
  updatePhaseState,
  scheduleCinematicScrub,
  finishAutomaticIntro,
  setSignatureKey,
}) {
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
      if (staticScene || progress >= 0.85) {
        nextPhase = 'settled';
      } else if (progress >= 0.72 && !introFailed) {
        nextPhase = 'crossfade';
      } else if (progress >= 0.09 && !introFailed) {
        nextPhase = 'cinematic';
      } else if (introFailed && progress >= 0.55) {
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
      const reveal = staticScene
        ? 1
        : isZoomed
          ? 0
          : smoothstep(clamp((progress - 0.71) / 0.16, 0, 1));
      const introFade = staticScene ? 1 : smoothstep(clamp((progress - 0.68) / 0.16, 0, 1));

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

}
