// AgentCarousel — carrusel de Agent Cards con scroll-snap horizontal.
// Autoplay cada 3.5s (loop), pausa en hover/touch, respeta prefers-reduced-motion.
// 3 tarjetas: Sage, Brimstone, Gekko.
import { useEffect, useRef, useState } from 'react';

const AUTOPLAY_MS = 2000;

const agents = [
  {
    key: 'sage',
    badge: 'VALORANT // AGENT #07',
    img: 'assets/imagenes/sage-wallpaper.jpg',
    alt: 'Sage, agente centinela de soporte en Valorant',
    tag: 'SENTINEL',
    code: 'RADIANITE',
  },
  {
    key: 'brimstone',
    badge: 'VALORANT // CONTROLLER',
    img: 'assets/imagenes/brimstone-wallpaper.jpg',
    alt: 'Brimstone, agente de control en Valorant',
    tag: 'CONTROLLER',
    code: '20% USO',
  },
  {
    key: 'gekko',
    badge: 'VALORANT // INITIATOR',
    img: 'assets/imagenes/gekko-wallpaper.jpg',
    alt: 'Gekko, agente iniciador en Valorant',
    tag: 'INITIATOR',
    code: '35% USO',
  },
];

export default function AgentCarousel() {
  const track = useRef(null);
  const paused = useRef(false);
  const [idx, setIdx] = useState(0);

  const step = () => {
    const el = track.current;
    if (!el) return 0;
    const card = el.querySelector('.ac-card');
    if (!card) return el.clientWidth;
    // Recalcula el ancho cada vez (no cachear) para soportar responsive
    return card.offsetWidth + 24;
  };

  const goTo = (i) => {
    const el = track.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(maxScroll, i * step()));
    el.scrollTo({ left: target, behavior: 'smooth' });
  };

  const go = (dir) => {
    goTo(idx + dir);
  };

  // Autoplay
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (paused.current) return;
      const el = track.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 4) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: step(), behavior: 'smooth' });
      }
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, []);

  // Sync idx con scroll (debounced para no disparar en cada frame)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const s = step();
        if (s === 0) return;
        const i = Math.round(el.scrollLeft / s);
        setIdx(Math.max(0, Math.min(agents.length - 1, i)));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="ac-wrap"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onTouchStart={() => { paused.current = true; }}
      onTouchEnd={() => { paused.current = false; }}
    >
      <div className="ac-track" ref={track} aria-label="Agentes que juega Amy">
        {agents.map((a, i) => (
          <div
            className={
              'card-sage portrait-card ac-card' +
              (i === idx ? ' ac-card--active' : '') +
              (a.key !== 'sage' ? ' ac-card--' + a.key : '')
            }
            key={a.key}
          >
            <div className="portrait-corner top-left"></div>
            <div className="portrait-corner bottom-right"></div>
            <div className="portrait-badge sage-badge">{a.badge}</div>
            <div className="portrait-img-wrapper">
              <img
                src={a.img}
                alt={a.alt}
                width="1920"
                height="1080"
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div className="portrait-footer">
              <span className="portrait-tag">{a.tag}</span>
              <span className="portrait-code">{a.code}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="ac-controls">
        <button type="button" className="ac-arrow" onClick={() => go(-1)} aria-label="Agente anterior">‹</button>
        <div className="ac-dots">
          {agents.map((a, i) => (
            <button
              type="button"
              key={a.key}
              className={'ac-dot' + (i === idx ? ' ac-dot--active' : '')}
              onClick={() => goTo(i)}
              aria-label={'Agente ' + (i + 1)}
            />
          ))}
        </div>
        <button type="button" className="ac-arrow" onClick={() => go(1)} aria-label="Agente siguiente">›</button>
      </div>
    </div>
  );
}
