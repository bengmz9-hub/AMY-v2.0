import { useEffect, useId, useRef, useState } from 'react';
import lens from '@/data/heroLens.json';
import AmySignature from '@/components/ui/AmySignature.jsx';
import './Hero.css';

const asset = (name) => `${import.meta.env.BASE_URL}assets/imagenes/${name}`;
const clamp = (value) => Math.max(0, Math.min(1, value));

export default function Hero() {
  const id = `amy-${useId().replace(/[^a-z0-9-]/gi, '')}`;
  const runway = useRef(null);
  const stage = useRef(null);
  const plane = useRef(null);
  const video = useRef(null);
  const aperture = useRef(null);
  const copy = useRef(null);
  const intro = useRef(null);
  const clips = useRef(null);
  const visible = useRef(true);
  const redraw = useRef(() => {});
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('loading');
  const [portraitError, setPortraitError] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const staticScene = reduced || status === 'error' || portraitError;

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduced(motionQuery.matches);
    motionQuery.addEventListener('change', updateMotion);
    return () => {
      motionQuery.removeEventListener('change', updateMotion);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let metrics;
    const draw = () => {
      frame = 0;
      if (!metrics) return;
      const m = metrics;
      const travel = Math.max(1, runway.current.offsetHeight - stage.current.offsetHeight);
      const progress = staticScene ? 1 : clamp(-runway.current.getBoundingClientRect().top / travel);
      const t = clamp((progress - 0.14) / 0.72);
      const ease = t * t * (3 - 2 * t);
      const startScale = Math.max(m.width / (lens.opening.width * m.ratio), m.height / (lens.opening.height * m.ratio)) * 1.2;
      const scale = Math.exp(Math.log(startScale) * (1 - ease));
      const centerX = m.width / 2 + (m.x + lens.focus.x * m.ratio - m.width / 2) * ease;
      const centerY = m.height / 2 + (m.y + lens.focus.y * m.ratio - m.height / 2) * ease;
      const x = centerX - lens.focus.x * m.ratio * scale;
      const y = centerY - lens.focus.y * m.ratio * scale;
      // One scroll transform. No time-based shake, tilt, or pointer transform.
      plane.current.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
      aperture.current.setAttribute('transform', `translate(${x},${y}) scale(${m.ratio * scale})`);
      video.current.parentElement.style.clipPath = t < 0.05 ? 'none' : `url(#${id}-lens-clip)`;
      const left = Math.max(0, Math.min(m.width, x + lens.bounds.left * m.ratio * scale));
      const top = Math.max(0, Math.min(m.height, y + lens.bounds.top * m.ratio * scale));
      const right = Math.max(0, Math.min(m.width, x + lens.bounds.right * m.ratio * scale));
      const bottom = Math.max(0, Math.min(m.height, y + lens.bounds.bottom * m.ratio * scale));
      Object.assign(video.current.style, {
        left: `${t < 0.05 ? 0 : left}px`, top: `${t < 0.05 ? 0 : top}px`,
        width: `${t < 0.05 ? m.width : Math.max(1, right - left)}px`, height: `${t < 0.05 ? m.height : Math.max(1, bottom - top)}px`,
      });
      const reveal = clamp((ease - 0.8) / 0.2);
      const introFade = clamp(t / 0.28);
      stage.current.style.setProperty('--lens-settle', clamp((ease - 0.58) / 0.42));
      stage.current.style.setProperty('--reveal', reveal);
      stage.current.style.setProperty('--intro-fade', introFade);
      stage.current.dataset.progress = progress.toFixed(4);
      stage.current.dataset.scale = scale.toFixed(4);
      stage.current.dataset.introDone = String(reveal > 0.98);
      copy.current.inert = reveal < 0.1;
      intro.current.inert = introFade > 0.98;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    redraw.current = schedule;
    const measure = () => {
      const scene = stage.current.getBoundingClientRect();
      const ratio = Math.max(scene.width / lens.width, scene.height / lens.height);
      const width = lens.width * ratio;
      const height = lens.height * ratio;
      plane.current.style.width = `${width}px`;
      plane.current.style.height = `${height}px`;
      metrics = {
        width: scene.width, height: scene.height, ratio,
        x: (scene.width - width) / 2,
        y: (scene.height - height) / 2,
      };
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
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
    };
  }, [staticScene, id]);

  useEffect(() => {
    const media = video.current;
    let active = true;
    const syncPlayback = () => {
      if (staticScene || paused || document.hidden || !visible.current) {
        media.pause();
        return;
      }
      media.play().catch(() => { if (active && !document.hidden) setStatus((current) => current === 'error' ? current : 'blocked'); });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(runway.current);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      media.pause();
    };
  }, [staticScene, paused]);

  const skipIntro = () => {
    if (!staticScene) {
      const travel = runway.current.offsetHeight - stage.current.offsetHeight;
      window.scrollTo({ top: window.scrollY + runway.current.getBoundingClientRect().top + travel * 0.92, behavior: 'instant' });
    }
    // Draw first so the revealed links are no longer inert when focus moves.
    redraw.current();
    requestAnimationFrame(() => clips.current.focus({ preventScroll: true }));
  };
  const replay = () => {
    video.current.currentTime = 0;
    setPaused(false);
    window.scrollTo({ top: window.scrollY + runway.current.getBoundingClientRect().top, behavior: 'instant' });
  };
  const retry = () => {
    if (status === 'error') video.current.load();
    setStatus('loading');
    setPaused(false);
    if (!reduced) video.current.play().catch(() => setStatus('blocked'));
  };

  return (
    <section ref={runway} className="amy-hero" id="amy" aria-labelledby="amy-hero-title" data-static={staticScene} data-portrait-error={portraitError}>
      <div ref={stage} className="amy-stage">
        <div className="amy-backdrop" style={{ '--amy-texture': `url(${asset('amy-hero-texture.svg')})` }} aria-hidden="true"><span className="amy-backdrop-word">AMY</span></div>
        <div className="amy-portrait-wrap">
          <div ref={plane} className="amy-portrait-plane">
            <svg className="amy-portrait" viewBox={`0 0 ${lens.width} ${lens.height}`} role="img" aria-label="AMY con gafas ámbar y chaqueta de cuero negro, integrada en un fondo gris perla con armas de Valorant en distintas direcciones">
              <defs>
                <filter id={`${id}-face-blend`} filterUnits="userSpaceOnUse" x="808" y="162" width="278" height="202"><feGaussianBlur stdDeviation="3" /></filter>
                <filter id={`${id}-neck-blend`} filterUnits="userSpaceOnUse" x="840" y="364" width="270" height="344"><feGaussianBlur stdDeviation="4" /></filter>
                <mask id={`${id}-portrait-retouch`} maskUnits="userSpaceOnUse" x="0" y="0" width={lens.width} height={lens.height}>
                  {/* Retouch only AMY; original glasses, features and tattoos stay underneath. */}
                  <path fill="white" stroke="white" strokeWidth="32" strokeLinejoin="round" d="M956 20 C869 16 809 75 781 124 C737 201 720 277 692 357 C668 426 636 478 602 500 C552 542 526 621 502 700 L466 821 H1438 C1406 741 1376 660 1340 595 C1314 537 1284 500 1234 475 C1204 398 1189 286 1153 203 C1127 100 1082 20 1000 20 Z" />
                  {/* Feather only the mask edges; keep the photo and facial features sharp. */}
                  <path fill="black" filter={`url(#${id}-face-blend)`} d="M836 189 C888 177 1007 174 1051 188 Q1059 192 1061 209 Q1071 222 1059 233 L1056 258 Q1048 269 977 271 Q961 269 947 249 Q935 237 925 251 Q913 272 893 272 Q850 271 836 259 L832 233 Q823 222 833 211 Z" />
                  <path fill="black" filter={`url(#${id}-face-blend)`} d="M933 265 Q919 271 917 287 Q922 299 943 301 Q965 298 973 286 Q970 274 956 265 Z" />
                  <ellipse fill="black" filter={`url(#${id}-face-blend)`} cx="946" cy="326" rx="50" ry="20" />
                  <path fill="black" filter={`url(#${id}-neck-blend)`} d="M893 382 L1027 382 L1048 462 L1085 523 L1086 583 L1045 672 L925 686 L871 617 L862 530 L887 472 Z" />
                </mask>
              </defs>
              <image href={asset('amy-hero-ultrawide-v2.png')} width={lens.width} height={lens.height} onError={() => setPortraitError(true)} />
              <image href={asset('amy-hero-ultrawide-v4-refined.png')} width={lens.width} height={lens.height} preserveAspectRatio="none" mask={`url(#${id}-portrait-retouch)`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            </svg>
          </div>
        </div>
        <div className="amy-lens-screen" aria-hidden="true">
          <video ref={video} className="amy-lens-video" src={asset('amy-hero-gameplay-flat-crt.mp4')} poster={asset('amy-hero-gameplay-flat-crt-poster.jpg')} autoPlay={!staticScene && !paused} muted loop playsInline preload="metadata" tabIndex={-1}
            onPlaying={() => setStatus('ready')} onError={() => setStatus('error')} />
          <div className="amy-lens-shade" />
        </div>
        <svg className="amy-lens-definition" aria-hidden="true"><defs><clipPath id={`${id}-lens-clip`} clipPathUnits="userSpaceOnUse"><path ref={aperture} d={lens.aperture} /></clipPath></defs></svg>

        <div ref={intro} className="amy-intro-copy">
          <p className="amy-intro-brand">AMY <span>/ VALORANT</span></p>
          <p className="amy-intro-caption">Todo empieza<br /><em>dentro del juego.</em><span>Desliza para conocer a AMY ↓</span></p>
          <a href="#shorts" className="amy-intro-link">Ir a los clips ↗</a>
        </div>
        <div className="amy-controls">
          <button className="amy-skip" type="button" onClick={skipIntro}>Saltar intro ↘</button>
          <button className="amy-replay" type="button" onClick={replay} disabled={staticScene}>Repetir intro ↗</button>
          <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused || staticScene} disabled={staticScene}>{reduced ? 'Movimiento reducido' : paused ? 'Reproducir vídeo' : 'Pausar vídeo'}</button>
        </div>
        <div ref={copy} className="amy-reveal">
          <span className="amy-valorant-margin" aria-hidden="true">VALORANT</span>
          <div className="amy-hero-copy">
            <figure className="amy-sage-card">
              <div className="amy-sage-art"><img src={asset('sage-wallpaper.jpg')} width="405" height="728" alt="Sage, el personaje principal de AMY en Valorant" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /></div>
              <figcaption><strong>Sage</strong><span>Main de AMY</span></figcaption>
            </figure>
            <p className="amy-eyebrow">Chica gamer / Valorant</p>
            <h1 id="amy-hero-title">En mi<br /><em>partida.</em></h1>
            <a ref={clips} href="#shorts" className="amy-clips-link">Ver clips <span aria-hidden="true">↗</span></a>
          </div>
          <aside className="amy-hero-aside" aria-label="Conoce a AMY">
            <AmySignature id={`${id}-signature`} src={asset('amy-signature-alpha.png')} />
            <div className="amy-aside-copy">
              <p>Soy AMY. Este es mi rincón de Valorant: clips y momentos dentro del juego.</p>
            </div>
          </aside>
          <span className="amy-scene-label" aria-hidden="true">01 / AMY · VALORANT</span>
          <span className="amy-scene-scroll" aria-hidden="true">Sigue la partida ↓</span>
        </div>
        {(status === 'error' || status === 'blocked' || portraitError) && <div className="amy-media-notice" role="status">
          <p>{portraitError ? 'No se pudo cargar el retrato. Los clips y redes siguen disponibles.' : status === 'error' ? 'El vídeo no está disponible. Puedes continuar con AMY y sus clips.' : 'Pulsa para iniciar el vídeo sin sonido.'}</p>
          {!portraitError && <button type="button" onClick={retry}>{status === 'error' ? 'Reintentar vídeo' : 'Reproducir vídeo'}</button>}
        </div>}
      </div>
    </section>
  );
}
