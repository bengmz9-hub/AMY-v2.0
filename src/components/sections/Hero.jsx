import { useCallback, useEffect, useId, useRef, useState } from 'react';
import lens from '@/data/heroLens.json';
import AmySignature from '@/components/ui/AmySignature.jsx';
import useAmyFrameSequence, { AMY_SEQUENCE_DURATION } from '@/hooks/useAmyFrameSequence.js';
import './Hero.css';

import { useHeroAnimation } from '@/hooks/useHeroAnimation.js';
import { useHeroScrollDampening } from '@/hooks/useHeroScrollDampening.js';


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


  // Scrollytelling & Parallax Animation
  useHeroAnimation({
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
  });



  // Scroll Dampening & Hijacking
  useHeroScrollDampening({
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
  });


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
