import { useCallback, useEffect, useId, useRef, useState } from 'react';
import lens from '@/data/heroLens.json';
import { PROFILE, SOCIAL_LINKS } from '@/data/profile.js';
import AmySignature from '@/components/ui/AmySignature.jsx';
import './Hero.css';

const asset = (name) => `${import.meta.env.BASE_URL}assets/${name}`;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const transitionDistance = (runway, stage) => stage.offsetHeight *
  Number(getComputedStyle(runway).getPropertyValue('--hero-transition'));

const SAGE_COPY = PROFILE.sageCopy;
const BIO_COPY = PROFILE.bioCopy;
const BIO_WORDS = BIO_COPY.split(' ');
const CLIPS_URL = SOCIAL_LINKS.find((social) => social.id === 'tiktok').href;

const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export default function Hero({ startupCoverActive = false, onStartupProgress }) {
  const id = `amy-${useId().replace(/[^a-z0-9-]/gi, '')}`;
  const runway = useRef(null);
  const stage = useRef(null);
  const plane = useRef(null);
  const gameplayVideo = useRef(null);
  const aperture = useRef(null);
  const lensMaterial = useRef(null);
  const lensGlare = useRef(null);
  const lensTrigger = useRef(null);
  const zoomCloseBtn = useRef(null);
  const copy = useRef(null);
  const introOverlay = useRef(null);
  const clips = useRef(null);
  const sageCard = useRef(null);
  const portraitImage = useRef(null);
  const plateImage = useRef(null);
  const prepareFullVideo = useRef(startupCoverActive);
  const startupCallback = useRef(onStartupProgress);
  startupCallback.current = onStartupProgress;
  const startupTasks = useRef({ portrait: 'pending', plate: 'pending', video: 'pending', layout: 'pending', heroAssets: 'pending' });
  const reportStartup = useCallback((task, state) => {
    if (startupTasks.current[task] === state) return;
    startupTasks.current = { ...startupTasks.current, [task]: state };
    startupCallback.current?.(startupTasks.current);
  }, []);

  const visible = useRef(true);
  const redraw = useRef(() => {});
  const initialHomeFragment = useRef(typeof window !== 'undefined' && window.location.hash === '#amy-home');
  const phaseRef = useRef('gameplay');
  const pausedRef = useRef(false);
  const zoomedRef = useRef(false);
  const diveRef = useRef(1); // Used when zoomed into glasses from settled state (1 = in glasses, 0 = fullscreen)
  const diveAnimRef = useRef(0);
  const savedScrollYRef = useRef(0);
  const gameplayResumeTime = useRef(0);
  const signatureTriggeredRef = useRef(false);

  const [phase, setPhase] = useState('gameplay');
  const [paused, setPaused] = useState(false);
  const [manualVideoRequested, setManualVideoRequested] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [signatureKey, setSignatureKey] = useState(0);
  const [status, setStatus] = useState('loading');
  const [portraitFormat, setPortraitFormat] = useState('webp');
  const [portraitError, setPortraitError] = useState(false);
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // Use .webm versions by default as requested; fallback to .mp4 only if .webm fails
  const [gameplayCodec, setGameplayCodec] = useState('av1');
  const [gameplayFailed, setGameplayFailed] = useState(false);
  const [downloadedVideo, setDownloadedVideo] = useState(null);

  const gameplaySrc =
    gameplayCodec === 'av1'
      ? asset('videos/valorant-gameplay-720p-av1.webm')
      : asset('videos/valorant-gameplay-720p-h264.mp4');
  // A complete Blob, rather than preload="auto", guarantees the selected file
  // is downloaded. Keep it for replay/loop after the cover has disappeared.
  const videoSrc = prepareFullVideo.current
    ? (downloadedVideo?.url === gameplaySrc ? downloadedVideo.src : undefined)
    : gameplaySrc;
  const staticScene = reduced || portraitError;
  const videoAllowed = (!reduced || manualVideoRequested) && !portraitError;

  const onGameplayError = useCallback(() => {
    if (gameplayCodec === 'av1') {
      gameplayResumeTime.current = gameplayVideo.current?.currentTime || 0;
      setGameplayCodec('h264');
      return;
    }
    setGameplayFailed(true);
    setStatus('error');
    redraw.current();
  }, [gameplayCodec]);

  useEffect(() => {
    if (!prepareFullVideo.current) return;
    const controller = new AbortController();
    let objectURL;
    fetch(gameplaySrc, { signal: controller.signal }).then(async response => {
      if (!response.ok || response.status === 206) throw new Error('Incomplete gameplay response.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('Empty gameplay response.');
      if (controller.signal.aborted) return;
      objectURL = URL.createObjectURL(blob);
      setDownloadedVideo({ url: gameplaySrc, src: objectURL });
    }).catch(() => { if (!controller.signal.aborted) onGameplayError(); });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [gameplaySrc, onGameplayError]);

  useEffect(() => {
    if (!startupCoverActive) return;
    let active = true;
    const cleanups = [];
    // Images inside the Hero plus its CSS masks, texture and video poster.
    // Portrait and plate already have their own decode/fallback gates.
    const images = [...runway.current.querySelectorAll('img')].filter(image =>
      image !== portraitImage.current && image !== plateImage.current);
    for (const name of ['amy.svg', 'juarez.svg', 'amy-hero-texture.svg', 'amy-signature-alpha.png', 'amy-hero-gameplay-flat-crt-poster.jpg']) {
      const image = new Image();
      image.src = asset(`images/amy/${name}`);
      images.push(image);
    }
    Promise.all(images.map(image => new Promise(resolve => {
      const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
      const failed = () => { cleanup(); if (active && image.isConnected) image.style.visibility = 'hidden'; resolve(false); };
      const loaded = async () => {
        cleanup();
        if (!image.naturalWidth) { failed(); return; }
        try { await image.decode(); resolve(true); } catch { failed(); }
      };
      cleanups.push(cleanup);
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      if (image.complete) loaded();
    }))).then(results => { if (active) reportStartup('heroAssets', results.every(Boolean) ? 'ready' : 'fallback'); });
    return () => { active = false; cleanups.forEach(cleanup => cleanup()); };
  }, [startupCoverActive, reportStartup]);

  useEffect(() => {
    const image = portraitImage.current;
    if (portraitError) { reportStartup('portrait', 'fallback'); return; }
    let active = true;
    const expected = image.src;
    reportStartup('portrait', 'pending');
    const failed = () => {
      if (!active || image.src !== expected) return;
      if (portraitFormat === 'webp') setPortraitFormat('png');
      else setPortraitError(true);
    };
    const loaded = async () => {
      if (!image.naturalWidth) { failed(); return; }
      try {
        await image.decode();
        if (active && image.src === expected) reportStartup('portrait', 'ready');
      } catch { failed(); }
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete) loaded();
    return () => { active = false; image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
  }, [portraitFormat, portraitError, reportStartup]);

  useEffect(() => {
    const image = plateImage.current;
    let active = true;
    const failed = () => {
      if (active) { image.style.visibility = 'hidden'; reportStartup('plate', 'fallback'); }
    };
    const loaded = async () => {
      if (!image.naturalWidth) { failed(); return; }
      try { await image.decode(); if (active) reportStartup('plate', 'ready'); }
      catch { failed(); }
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete) loaded();
    return () => { active = false; image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
  }, [reportStartup]);

  useEffect(() => {
    if ((!prepareFullVideo.current && staticScene) || gameplayFailed) {
      reportStartup('video', gameplayFailed ? 'fallback' : 'ready');
      return;
    }
    const video = gameplayVideo.current;
    const expected = videoSrc && new URL(videoSrc, document.baseURI).href;
    reportStartup('video', 'pending');
    const loaded = () => {
      if (expected && video.readyState >= 2 && video.currentSrc === expected) reportStartup('video', 'ready');
    };
    video.addEventListener('loadeddata', loaded);
    loaded();
    return () => video.removeEventListener('loadeddata', loaded);
  }, [staticScene, gameplayFailed, videoSrc, reportStartup]);

  useEffect(() => {
    const visibleDraw = () => { if (!document.hidden) redraw.current(); };
    document.addEventListener('visibilitychange', visibleDraw);
    return () => document.removeEventListener('visibilitychange', visibleDraw);
  }, []);

  const updatePhaseState = useCallback((nextPhase) => {
    if (phaseRef.current !== nextPhase) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      window.dispatchEvent(new CustomEvent('amy-hero-phase'));
    }
  }, []);

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
  }, [paused]);

  // Navigation owns its destination; cancel glasses without restoring the saved Hero position.
  const cancelGlassesForNavigation = useCallback(() => {
    if (!zoomedRef.current && !diveAnimRef.current) return;
    cancelAnimationFrame(diveAnimRef.current);
    diveAnimRef.current = 0;
    diveRef.current = 1;
    zoomedRef.current = false;
    setZoomed(false);
    redraw.current();
  }, []);

  // Native scroll moves the camera in both directions; the gameplay clock stays independent.
  useEffect(() => {
    let frame = 0;
    let metrics = null;
    let smoothedWipe = 0;
    let wipeInitialized = false;
    let lastWipeTime = null;

    const draw = (now) => {
      frame = 0;
      if (!metrics || !runway.current || !stage.current || !plane.current) return;
      const m = metrics;
      const isZoomed = zoomedRef.current;

      const travel = Math.max(1, transitionDistance(runway.current, stage.current));
      const scroll = -runway.current.getBoundingClientRect().top;
      // Native scroll can round the final subpixel, especially on mobile.
      const progress = staticScene || gameplayFailed || scroll >= travel - 1 ? 1
        : clamp(scroll / travel);
      const nextPhase = progress >= 1 ? 'settled' : 'gameplay';
      updatePhaseState(nextPhase);

      // One camera move from fullscreen gameplay to the final portrait geometry.
      const startScale =
        Math.max(
          m.width / (lens.opening.width * m.ratio),
          m.height / (lens.opening.height * m.ratio)
        ) * 1.2;
      const glassesSvgX = (lens.bounds.left + lens.bounds.right) * 0.5;
      const glassesSvgY = (lens.bounds.top + lens.bounds.bottom) * 0.5;

      const finalGlassesX = m.x + glassesSvgX * m.ratio;
      const finalGlassesY = m.y + glassesSvgY * m.ratio;
      const t = staticScene ? 1
        : isZoomed || diveAnimRef.current ? clamp(diveRef.current)
        : progress;
      const ease = smoothstep(t);
      const anchorSvgX = lens.focus.x + (glassesSvgX - lens.focus.x) * ease;
      const anchorSvgY = lens.focus.y + (glassesSvgY - lens.focus.y) * ease;
      const baseCenterX = m.width / 2 + (finalGlassesX - m.width / 2) * ease;
      const baseCenterY = m.height / 2 + (finalGlassesY - m.height / 2) * ease;

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

      // The opening video keeps playing inside the lenses after the camera settles.
      // Reduced motion keeps the still portrait until playback is explicitly requested.
      if (gameplayVideo.current?.parentElement) {
        gameplayVideo.current.parentElement.style.opacity =
          !videoAllowed || gameplayFailed ? '0' : '1';
      }

      const lensSettle = clamp((ease - 0.25) / 0.75);
      const reveal = staticScene ? 1 : isZoomed ? 0 : smoothstep(clamp((progress - 0.65) / 0.35));
      const introFade = staticScene ? 1 : smoothstep(clamp((progress - 0.65) / 0.35));

      if (reveal > 0.55 && !signatureTriggeredRef.current) {
        signatureTriggeredRef.current = true;
      } else if (progress < 0.1 && signatureTriggeredRef.current) {
        signatureTriggeredRef.current = false;
        setSignatureKey((k) => k + 1);
      }

      const cs = getComputedStyle(runway.current);
      const dwell = m.height * (Number(cs.getPropertyValue('--hero-dwell')) || .15);
      const wipeSpan = Math.max(1, m.height * (Number(cs.getPropertyValue('--hero-wipe-span')) || 1.11));
      const dwellEnd = travel + dwell;
      // La transición diagonal solo existe desde el Hero background asentado (progress >= 1), nunca sobre el vídeo de intro.
      const targetWipe = staticScene || progress < 1 ? 0 : clamp((scroll - dwellEnd) / wipeSpan, 0, 1);
      if (
        !wipeInitialized ||
        staticScene ||
        progress < 1 ||
        (targetWipe === 0 && smoothedWipe > 0.85)
      ) {
        smoothedWipe = targetWipe;
        wipeInitialized = true;
      } else {
        // Preserve the approved 0.1-at-60Hz response across refresh rates.
        // An idle loop starts with one reference frame, not the idle duration.
        const elapsed = lastWipeTime === null ? 1000 / 60 : Math.max(0, now - lastWipeTime);
        const response = 1 - Math.pow(1 - 0.1, elapsed * 60 / 1000);
        smoothedWipe += (targetWipe - smoothedWipe) * response;
        if (Math.abs(targetWipe - smoothedWipe) < 0.0004) {
          smoothedWipe = targetWipe;
        }
      }
      const wipe = smoothedWipe;
      const wipeStr = wipe.toFixed(4);

      // The wipe disables pointer interaction in CSS. Match that boundary for
      // keyboard navigation so covered Hero controls cannot take focus.
      const covered = wipeStr !== '0.0000';
      if (covered && stage.current.contains(document.activeElement)) document.activeElement.blur();
      stage.current.inert = covered;

      stage.current.style.clipPath = 'none';
      stage.current.style.setProperty('--lens-settle', lensSettle.toFixed(4));
      stage.current.style.setProperty('--reveal', reveal.toFixed(4));
      stage.current.style.setProperty('--intro-fade', introFade.toFixed(4));
      stage.current.style.setProperty('--hero-progress', progress.toFixed(4));
      stage.current.style.setProperty('--wipe', wipeStr);
      stage.current.dataset.phase = nextPhase;
      stage.current.dataset.progress = progress.toFixed(4);
      stage.current.dataset.wipe = wipeStr;
      stage.current.dataset.scale = scale.toFixed(4);
      stage.current.dataset.introDone = String(reveal > 0.55);
      stage.current.dataset.zoomed = String(isZoomed);
      runway.current.dataset.wipe = wipeStr;
      runway.current.dataset.wipeTarget = targetWipe.toFixed(4);
      runway.current.dataset.progress = progress.toFixed(4);
      window.dispatchEvent(new CustomEvent('amy-hero-wipe'));

      if (Math.abs(targetWipe - smoothedWipe) > 0.0004) {
        lastWipeTime = now;
        frame = requestAnimationFrame(draw);
      } else {
        lastWipeTime = null;
      }

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
      if (!document.hidden) reportStartup('layout', 'ready');
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redraw.current = schedule;

    const onScroll = () => {
      schedule();
    };
    const onHistoryNavigation = () => {
      cancelGlassesForNavigation();
    };
    const onAnchorClick = (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link && (link.hash || link.getAttribute('href') === '#')) {
        cancelGlassesForNavigation();
      }
    };

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
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onAnchorClick, true);
    window.addEventListener('popstate', onHistoryNavigation);
    window.addEventListener('hashchange', onHistoryNavigation);
    window.addEventListener('resize', measure);
    measure();
    const homeFragmentFrame = initialHomeFragment.current ? requestAnimationFrame(() => {
      initialHomeFragment.current = false;
      if (location.hash === '#amy-home') document.getElementById('amy-home')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }) : 0;

    return () => {
      redraw.current = () => {};
      cancelAnimationFrame(frame);
      cancelAnimationFrame(homeFragmentFrame);
      resize.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onAnchorClick, true);
      window.removeEventListener('popstate', onHistoryNavigation);
      window.removeEventListener('hashchange', onHistoryNavigation);
      window.removeEventListener('resize', measure);
    };
  }, [staticScene, videoAllowed, id, gameplayFailed, updatePhaseState, cancelGlassesForNavigation, reportStartup]);

  // One video clock runs through the intro, settled glasses and fullscreen re-entry.
  // The AMY portrait stays still; only the lens reflection plays while visible.
  useEffect(() => {
    const gv = gameplayVideo.current;
    let active = true;

    const syncPlayback = () => {
      if (!gv) return;
      gv.muted = true;
      gv.defaultMuted = true;
      const shouldPlay = () => !startupCoverActive && videoAllowed && !pausedRef.current &&
        !document.hidden && visible.current && !gameplayFailed;
      if (shouldPlay()) {
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
    syncPlayback();

    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      gv?.removeEventListener('loadeddata', syncPlayback);
      gv?.pause();
    };
  }, [
    zoomed,
    reduced,
    manualVideoRequested,
    paused,
    videoAllowed,
    videoSrc,
    gameplayFailed,
    phase,
    staticScene,
    startupCoverActive,
  ]);

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
    if (!staticScene && runway.current && stage.current) {
      const origin = window.scrollY + runway.current.getBoundingClientRect().top;
      const travel = transitionDistance(runway.current, stage.current);
      window.scrollTo({ top: origin + travel, behavior: 'instant' });
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
    cancelAnimationFrame(diveAnimRef.current);
    diveAnimRef.current = 0;
    zoomedRef.current = false;
    setZoomed(false);
    diveRef.current = 1;
    gameplayResumeTime.current = 0;
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
    setGameplayCodec('av1');
    setStatus('loading');
    replay();
    requestAnimationFrame(() => gameplayVideo.current?.load());
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
      <div id="amy-home" className="amy-settled-anchor" aria-hidden="true" />
      <h1 id="amy-hero-title" className="sr-only">
        AMY — Valorant · Main Sage
      </h1>

      <div ref={stage} className="amy-stage">
        <div
          className="bg-layers"
          aria-hidden="true"
          style={{
            // Custom-property URLs resolve at their CSS use site; anchor them to the page,
            // not the bundled stylesheet directory, including when hosted in a subpath.
            '--mask-amy': `url("${new URL(asset('images/amy/amy.svg'), document.baseURI).href}")`,
            '--mask-juarez': `url("${new URL(asset('images/amy/juarez.svg'), document.baseURI).href}")`,
          }}
        >
          <img
            ref={plateImage}
            className="bg-layers__plate"
            src={asset('images/amy/jjettas-pebble-light-plate.webp')}
            alt=""
            width="1915"
            height="821"
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
          />
          <div className="bg-layers__marquees">
            <div className="bg-layers__marquee">
              <div className="bg-layers__track bg-layers__track--top">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index} className="bg-layers__word bg-layers__word--amy" />
                ))}
              </div>
            </div>
            <div className="bg-layers__marquee">
              <div className="bg-layers__track bg-layers__track--bottom">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} className="bg-layers__word bg-layers__word--juarez" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="amy-backdrop" aria-hidden="true">
          <div
            className="amy-backdrop-texture"
            style={{ backgroundImage: `url(${asset('images/amy/amy-hero-texture.svg')})` }}
          />
          <span className="amy-backdrop-word">AMY</span>
        </div>

        <div className="amy-wipe-scale">
          <div className="amy-portrait-wrap">
            <div ref={plane} className="amy-portrait-plane">
              <img
                ref={portraitImage}
                className="amy-portrait"
                src={asset(`images/amy/amy-cutout.${portraitFormat}`)}
                width="1915"
                height="821"
                alt="AMY con gafas ámbar y chaqueta de cuero negro"
                decoding="async"
                onError={() => {
                  if (portraitFormat === 'webp') setPortraitFormat('png');
                  else setPortraitError(true);
                }}
              />
            </div>
          </div>

          <div className="amy-lens-screen" aria-hidden="true">
            <video
              ref={gameplayVideo}
              className="amy-lens-video"
              src={videoSrc}
              poster={asset('images/amy/amy-hero-gameplay-flat-crt-poster.jpg')}
              muted
              loop
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
              onLoadedData={() => { setStatus('ready'); redraw.current(); }}
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
                <feGaussianBlur stdDeviation="0.9" />
              </filter>
              <linearGradient
                id={`${id}-lens-top-shade`}
                gradientUnits="userSpaceOnUse"
                x1="946"
                y1="184"
                x2="946"
                y2="268"
              >
                <stop offset="0" stopColor="#050407" stopOpacity="0.18" />
                <stop offset="0.22" stopColor="#050407" stopOpacity="0.04" />
                <stop offset="0.78" stopColor="#050407" stopOpacity="0" />
                <stop offset="1" stopColor="#050407" stopOpacity="0.12" />
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
                strokeOpacity="0.28"
                strokeWidth="2.2"
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

          {/* Accessible transparent trigger over the settled glasses for fullscreen Valorant re-entry */}
          <button
            ref={lensTrigger}
            type="button"
            className="amy-lens-trigger"
            aria-label="Ampliar vídeo de Valorant en las gafas de AMY"
            onClick={openGlassesView}
          >
            <span className="amy-lens-hint" aria-hidden="true">Ver gameplay ↗</span>
          </button>

          {/* Settled Hero content: two balanced narrow side columns on desktop; upper bio+signature row & compact Sage dock on mobile */}
          <div ref={copy} className="amy-reveal">
            <img
              className="amy-valorant-margin"
              src={asset('images/amy/valorant-vertical-red.png')}
              width="118"
              height="672"
              alt=""
              aria-hidden="true"
            />

            <aside className="amy-col-left" aria-label="Conoce a AMY">
              <div className="amy-signature-wrap">
                <AmySignature
                  key={signatureKey}
                  id={`${id}-signature`}
                  src={asset('images/amy/amy-signature-alpha.png')}
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

            <div className="amy-col-right">
              <a
                ref={(node) => {
                  clips.current = node;
                  sageCard.current = node;
                }}
                href={CLIPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="amy-sage-card"
                aria-label="Sage · Main Ver clips en TikTok (abre en otra pestaña)"
                onPointerMove={onSagePointerMove}
                onPointerLeave={onSagePointerLeave}
              >
                <div className="amy-sage-tilt">
                  <div className="amy-sage-aura" aria-hidden="true" />
                  <div className="amy-sage-art">
                    <img
                      src={asset('images/agents/sage-mystic-portrait.jpg')}
                      width="512"
                      height="1024"
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
                      </span>{' '}
                      <span className="amy-sage-cta">
                        Ver clips <span aria-hidden="true">↗</span>
                      </span>
                    </div>
                  </div>
                </div>
              </a>
              <p className="amy-col-copy">{SAGE_COPY}</p>
            </div>
          </div>
        </div>

        {/* Intro peripheral bar (active during the reversible scroll transition) */}
        <div ref={introOverlay} className="amy-intro-bar">
          <div className="amy-intro-meta">
            <span className="amy-intro-brand">
              AMY <span>/ VALORANT</span>
            </span>
            <span className="amy-intro-phase-label">
              <span className="amy-intro-label-desktop">Desliza para conocer a AMY</span>
              <span className="amy-intro-label-mobile">Desliza</span> ↓
            </span>
            <span className="amy-intro-progress" aria-hidden="true" />
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
              {isVideoPaused ? 'Reanudar vídeo' : 'Pausar vídeo'}
            </button>
            <a href={CLIPS_URL} className="amy-intro-link" target="_blank" rel="noopener noreferrer"
              aria-label="Ver clips de AMY en TikTok (abre en otra pestaña)">
              Ver clips <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        {/* Settled peripheral controls (bottom-right, clear of portrait and side columns) */}
        <div
          className="amy-controls"
          inert={phase !== 'settled' || zoomed ? true : undefined}
        >
          <button
            className="amy-pause-btn"
            type="button"
            onClick={togglePause}
            aria-pressed={isVideoPaused}
          >
            {isVideoPaused ? 'Reanudar vídeo' : 'Pausar vídeo'}
          </button>
          <button className="amy-replay" type="button" onClick={replay}>
            Repetir intro ↺
          </button>
        </div>
        <div className="amy-scroll-cue" aria-hidden="true">
          Continúa <span>↓</span>
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
              {isVideoPaused ? 'Reanudar vídeo' : 'Pausar vídeo'}
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
