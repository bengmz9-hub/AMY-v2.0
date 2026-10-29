import { useEffect, useRef } from 'react';
import './GrowCarousel.css';

const asset = (name) => `${import.meta.env.BASE_URL}assets/imagenes/${name}`;
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smoothstep = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

const GROW_ITEMS = [
  {
    id: 'sage-mystic',
    title: 'Sage // Orbe Místico',
    subtitle: 'Main Sentinel · 45% Uso',
    badge: 'AGENT // 07',
    img: asset('sage-mystic-portrait.jpg'),
    fallbackBg: 'radial-gradient(circle at 50% 35%, #8fd6c4 0%, #2d5a52 55%, #0c1414 100%)',
  },
  {
    id: 'amy-clutch',
    title: 'Clutch & Aim Control',
    subtitle: 'The Amy Show · Gameplay',
    badge: 'CLIP // VALORANT',
    img: asset('amy-hero-gameplay-flat-crt-poster.jpg'),
    fallbackBg: 'radial-gradient(circle at 50% 40%, #c07a8b 0%, #48212d 55%, #12090d 100%)',
  },
  {
    id: 'gekko-wingman',
    title: 'Gekko // Wingman',
    subtitle: 'Initiator · 35% Uso',
    badge: 'INITIATOR // 35%',
    img: asset('gekko-wallpaper.jpg'),
    fallbackBg: 'radial-gradient(circle at 50% 40%, #8ce65a 0%, #2b592c 55%, #0d1710 100%)',
  },
  {
    id: 'amy-portrait',
    title: 'AMY J. GIL',
    subtitle: 'Platino · Creadora de Contenido',
    badge: 'ROSE GAMING // VIP',
    img: asset('amy-cutout.webp'),
    fallbackBg: 'radial-gradient(circle at 50% 35%, #d3c8ba 0%, #7d5360 55%, #171015 100%)',
  },
  {
    id: 'brimstone-orbital',
    title: 'Brimstone // Orbital',
    subtitle: 'Controller · 20% Uso',
    badge: 'CONTROLLER // 20%',
    img: asset('brimstone-wallpaper.jpg'),
    fallbackBg: 'radial-gradient(circle at 50% 40%, #ff8c3b 0%, #632810 55%, #170a06 100%)',
  },
  {
    id: 'sage-wall',
    title: 'Barrera de Jade',
    subtitle: 'Control de Terreno · Defensa',
    badge: 'SENTINEL // SAGE',
    img: asset('sage-wallpaper.jpg'),
    fallbackBg: 'radial-gradient(circle at 50% 40%, #2ee6a8 0%, #164f47 55%, #081515 100%)',
  },
  {
    id: 'gekko-art',
    title: 'Dizzy & Thrash',
    subtitle: 'Reconocimiento Dinámico',
    badge: 'TACTICAL // GEKKO',
    img: asset('gekko_art.webp'),
    fallbackBg: 'radial-gradient(circle at 50% 40%, #a3e635 0%, #365314 55%, #0b1408 100%)',
  },
];

const CONFIG = {
  copies: 5,
  idleDriftPxPerSec: 16,
  maxSteerPxPerSec: 95,
  mouseImpulseGain: 0.45,
  growScale: 1.22,
  extraPartGap: 4,
  lerpRate: 0.1,
  dimOpacity: 0.42,
  idleOpacity: 0.9,
};

const SLOTS = Array.from({ length: GROW_ITEMS.length * CONFIG.copies }, (_, slot) => ({
  slot,
  itemIndex: slot % GROW_ITEMS.length,
  item: GROW_ITEMS[slot % GROW_ITEMS.length],
}));

export default function AgentCarousel() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const ambientRef = useRef(null);
  const slashAuraRef = useRef(null);
  const slashGlowRef = useRef(null);
  const slashCoreRef = useRef(null);
  const backdropRefs = useRef([]);
  const cardRefs = useRef([]);
  const shadeRefs = useRef([]);
  const ringRefs = useRef([]);
  const badgeRefs = useRef([]);
  const captionRefs = useRef([]);

  useEffect(() => {
    const sectionEl = sectionRef.current;
    const stageEl = stageRef.current;
    const trackEl = trackRef.current;
    const ambientEl = ambientRef.current;
    if (!sectionEl || !stageEl || !trackEl) return;

    const n = GROW_ITEMS.length;
    const totalCards = SLOTS.length;
    const progresses = new Float32Array(totalCards);
    const halfRooms = new Float32Array(totalCards);
    const itemWeights = new Float32Array(n);

    let hoveredSlot = -1;
    let focusedSlot = -1;
    let hoverPresence = 0;
    let scrollOffset = 0;
    let velocityPxPerSec = CONFIG.idleDriftPxPerSec;
    let impulseOffset = 0;
    let isVisible = true;
    let rafId = 0;
    let lastTime = performance.now();

    const pointerPos = {
      x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 720,
      y: -9999,
      active: false,
    };

    const getCardMetrics = () => {
      const firstCard = cardRefs.current[0];
      const cardW = firstCard ? firstCard.offsetWidth : 380;
      const style = window.getComputedStyle(trackEl);
      const gap = parseFloat(style.columnGap || style.gap || '10') || 10;
      return { cardW, gap, step: cardW + gap };
    };

    // Inicializar en el ciclo central (2 * singleCycleWidth)
    const initMetrics = getCardMetrics();
    scrollOffset = n * initMetrics.step * 2;

    let targetRaw = 0;
    let smoothedRaw = 0;
    let wipeInit = false;

    const applyWipeState = (rawVal) => {
      const enter = smoothstep(rawVal);
      const yLeft = 100 - rawVal * 122;
      const yRight = 118 - rawVal * 122;

      sectionEl.style.setProperty('--enter', enter.toFixed(4));
      sectionEl.style.setProperty('--y-left', `${yLeft.toFixed(2)}%`);
      sectionEl.style.setProperty('--y-right', `${yRight.toFixed(2)}%`);

      stageEl.dataset.visible = String(rawVal > 0.001);
      stageEl.dataset.active = String(rawVal > 0.03);
      stageEl.dataset.settled = String(rawVal >= 0.996);
      sectionEl.dataset.wiping = String(rawVal > 0.004 && rawVal < 0.994);

      const y1Str = yLeft.toFixed(2);
      const y2Str = yRight.toFixed(2);
      if (slashAuraRef.current) {
        slashAuraRef.current.setAttribute('y1', y1Str);
        slashAuraRef.current.setAttribute('y2', y2Str);
      }
      if (slashGlowRef.current) {
        slashGlowRef.current.setAttribute('y1', y1Str);
        slashGlowRef.current.setAttribute('y2', y2Str);
      }
      if (slashCoreRef.current) {
        slashCoreRef.current.setAttribute('y1', y1Str);
        slashCoreRef.current.setAttribute('y2', y2Str);
      }
    };

    const updateEnterBridge = () => {
      if (!sectionEl || !stageEl) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        targetRaw = 1;
        smoothedRaw = 1;
        sectionEl.style.setProperty('--enter', '1');
        sectionEl.style.setProperty('--y-left', '-30%');
        sectionEl.style.setProperty('--y-right', '-10%');
        stageEl.dataset.visible = 'true';
        stageEl.dataset.active = 'true';
        stageEl.dataset.settled = 'true';
        sectionEl.dataset.wiping = 'false';
        return;
      }

      const heroEl = document.getElementById('amy');
      const heroStage = heroEl?.querySelector('.amy-stage');
      const heroPhase = heroStage?.dataset.phase || heroEl?.dataset.phase;

      // Mientras el Hero está en el vídeo de intro (gameplay), queda prohibida cualquier transición al carrusel.
      if (heroPhase && heroPhase !== 'settled') {
        targetRaw = 0;
        smoothedRaw = 0;
        wipeInit = true;
        applyWipeState(0);
        return;
      }

      if (heroEl && heroEl.dataset.wipeTarget !== undefined) {
        targetRaw = clamp(Number(heroEl.dataset.wipeTarget) || 0, 0, 1);
      } else {
        const rect = sectionEl.getBoundingClientRect();
        const vh = Math.max(1, window.innerHeight);
        const cs = getComputedStyle(sectionEl);
        const wipeSpanRatio = Number(cs.getPropertyValue('--gc-wipe-span')) || 1.85;
        const wipeSpanPx = Math.max(1, vh * wipeSpanRatio);
        targetRaw = clamp(-rect.top / wipeSpanPx, 0, 1);
      }

      if (!wipeInit) {
        smoothedRaw = targetRaw;
        wipeInit = true;
        applyWipeState(smoothedRaw);
      } else if (Math.abs(targetRaw - smoothedRaw) > 0.0003) {
        if (!rafId) {
          lastTime = performance.now();
          rafId = requestAnimationFrame(tick);
        }
      }
    };

    const shiftCycleBackward = () => {
      for (let s = 0; s < totalCards - n; s++) {
        progresses[s] = progresses[s + n];
      }
      for (let s = totalCards - n; s < totalCards; s++) {
        progresses[s] = 0;
      }
      if (hoveredSlot >= n) hoveredSlot -= n;
      if (focusedSlot >= n) focusedSlot -= n;
    };

    const shiftCycleForward = () => {
      for (let s = totalCards - 1; s >= n; s--) {
        progresses[s] = progresses[s - n];
      }
      for (let s = 0; s < n; s++) {
        progresses[s] = 0;
      }
      if (hoveredSlot !== -1 && hoveredSlot < totalCards - n) hoveredSlot += n;
      if (focusedSlot !== -1 && focusedSlot < totalCards - n) focusedSlot += n;
    };

    const updateHoveredSlotFromPointer = (gap) => {
      if (!pointerPos.active) {
        hoveredSlot = focusedSlot;
        return;
      }

      const px = pointerPos.x;
      const py = pointerPos.y;
      const halfGap = gap * 0.6;

      if (hoveredSlot !== -1 && cardRefs.current[hoveredSlot]) {
        const r = cardRefs.current[hoveredSlot].getBoundingClientRect();
        if (
          px >= r.left - 6 &&
          px <= r.right + 6 &&
          py >= r.top - 16 &&
          py <= r.bottom + 16
        ) {
          return;
        }
      }

      let bestSlot = -1;
      let bestDist = Infinity;

      for (let i = 0; i < totalCards; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (py < r.top - 16 || py > r.bottom + 16) continue;
        if (px >= r.left - halfGap && px <= r.right + halfGap) {
          const center = (r.left + r.right) * 0.5;
          const dist = Math.abs(px - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestSlot = i;
          }
        }
      }

      hoveredSlot = bestSlot !== -1 ? bestSlot : focusedSlot;
    };

    const tick = (now) => {
      const wipingPending = Math.abs(targetRaw - smoothedRaw) > 0.0003;
      if (!isVisible && !wipingPending) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lerpFactor = 1 - Math.pow(1 - CONFIG.lerpRate, dt * 60);
      const lerpWipe = 1 - Math.pow(1 - 0.085, dt * 60);

      if (!reducedMotion) {
        smoothedRaw += (targetRaw - smoothedRaw) * lerpWipe;
        if (Math.abs(targetRaw - smoothedRaw) < 0.0003) {
          smoothedRaw = targetRaw;
        }
        applyWipeState(smoothedRaw);
      }

      const { cardW, gap, step } = getCardMetrics();
      updateHoveredSlotFromPointer(gap);

      let targetVelocity = CONFIG.idleDriftPxPerSec;
      if (reducedMotion) {
        targetVelocity = 0;
      } else if (pointerPos.active) {
        const normX = (pointerPos.x / Math.max(1, window.innerWidth) - 0.5) * 2;
        const shaped = Math.sign(normX) * Math.pow(Math.abs(normX), 1.6);
        targetVelocity = shaped * CONFIG.maxSteerPxPerSec;
      }

      velocityPxPerSec += (targetVelocity - velocityPxPerSec) * lerpFactor;

      const impulseStep = impulseOffset * Math.min(1, dt * 8);
      impulseOffset -= impulseStep;

      scrollOffset += velocityPxPerSec * dt + impulseStep;

      const singleCycleWidth = n * step;
      while (scrollOffset >= singleCycleWidth * 3) {
        scrollOffset -= singleCycleWidth;
        shiftCycleBackward();
      }
      while (scrollOffset < singleCycleWidth) {
        scrollOffset += singleCycleWidth;
        shiftCycleForward();
      }

      const targetPresence = hoveredSlot !== -1 ? 1 : 0;
      hoverPresence += (targetPresence - hoverPresence) * lerpFactor;

      const extraHalfWidth = (cardW * (CONFIG.growScale - 1)) / 2 + CONFIG.extraPartGap;

      for (let i = 0; i < totalCards; i++) {
        const target = i === hoveredSlot ? 1 : 0;
        progresses[i] += (target - progresses[i]) * lerpFactor;
        if (progresses[i] < 0.001 && target === 0) progresses[i] = 0;
        halfRooms[i] = progresses[i] * extraHalfWidth;
      }

      itemWeights.fill(0);

      for (let i = 0; i < totalCards; i++) {
        let shiftX = 0;
        for (let k = 0; k < totalCards; k++) {
          const r = halfRooms[k];
          if (r === 0) continue;
          if (i < k) shiftX -= r;
          else if (i > k) shiftX += r;
        }

        const p = progresses[i];
        const itemIdx = i % n;
        if (p > itemWeights[itemIdx]) {
          itemWeights[itemIdx] = p;
        }

        const scale = 1 + (CONFIG.growScale - 1) * p;
        const baseOp = CONFIG.idleOpacity - hoverPresence * (CONFIG.idleOpacity - CONFIG.dimOpacity);
        const opacity = baseOp + p * (1 - baseOp);
        const baseBright = 0.94 - hoverPresence * 0.32;
        const brightness = baseBright + p * (1.05 - baseBright);

        const cardEl = cardRefs.current[i];
        if (cardEl) {
          cardEl.style.transform = `translate3d(${shiftX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
          cardEl.style.opacity = opacity.toFixed(3);
          cardEl.style.filter = `brightness(${brightness.toFixed(3)})`;
          cardEl.style.zIndex = p > 0.05 ? String(10 + Math.round(p * 20)) : '1';
        }

        const shadeEl = shadeRefs.current[i];
        if (shadeEl) shadeEl.style.opacity = p.toFixed(3);

        const ringEl = ringRefs.current[i];
        if (ringEl) ringEl.style.opacity = p.toFixed(3);

        const captionEl = captionRefs.current[i];
        if (captionEl) {
          captionEl.style.opacity = p.toFixed(3);
          captionEl.style.transform = `translate3d(0, ${((1 - p) * 10).toFixed(2)}px, 0)`;
        }

        const badgeEl = badgeRefs.current[i];
        if (badgeEl) {
          badgeEl.style.opacity = p.toFixed(3);
          badgeEl.style.transform = `translate3d(0, ${((1 - p) * -6).toFixed(2)}px, 0)`;
        }
      }

      trackEl.style.transform = `translate3d(${-scrollOffset.toFixed(2)}px, 0, 0)`;

      for (let idx = 0; idx < n; idx++) {
        const layerEl = backdropRefs.current[idx];
        if (layerEl) {
          layerEl.style.opacity = (itemWeights[idx] * 0.92).toFixed(3);
        }
      }
      if (ambientEl) {
        ambientEl.style.opacity = (1 - hoverPresence * 0.85).toFixed(3);
      }

      rafId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (e) => {
      if (pointerPos.active) {
        const dx = e.clientX - pointerPos.x;
        impulseOffset += dx * CONFIG.mouseImpulseGain;
      }
      pointerPos.x = e.clientX;
      pointerPos.y = e.clientY;
      pointerPos.active = true;
    };

    const onPointerLeave = () => {
      pointerPos.active = false;
      hoveredSlot = focusedSlot;
    };

    const onFocusIn = (e) => {
      const card = e.target instanceof Element ? e.target.closest('.grow-card') : null;
      if (!card) return;
      const idx = cardRefs.current.indexOf(card);
      if (idx !== -1) {
        focusedSlot = idx;
        hoveredSlot = idx;
      }
    };

    const onFocusOut = () => {
      focusedSlot = -1;
      if (!pointerPos.active) hoveredSlot = -1;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startLoop();
      },
      { rootMargin: '220px 0px' }
    );
    io.observe(sectionEl);

    updateEnterBridge();
    window.addEventListener('scroll', updateEnterBridge, { passive: true });
    window.addEventListener('resize', updateEnterBridge);
    window.addEventListener('amy-hero-wipe', updateEnterBridge);
    window.addEventListener('amy-hero-phase', updateEnterBridge);
    stageEl.addEventListener('pointermove', onPointerMove, { passive: true });
    stageEl.addEventListener('pointerleave', onPointerLeave);
    trackEl.addEventListener('focusin', onFocusIn);
    trackEl.addEventListener('focusout', onFocusOut);

    startLoop();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      io.disconnect();
      window.removeEventListener('scroll', updateEnterBridge);
      window.removeEventListener('resize', updateEnterBridge);
      window.removeEventListener('amy-hero-wipe', updateEnterBridge);
      window.removeEventListener('amy-hero-phase', updateEnterBridge);
      stageEl.removeEventListener('pointermove', onPointerMove);
      stageEl.removeEventListener('pointerleave', onPointerLeave);
      trackEl.removeEventListener('focusin', onFocusIn);
      trackEl.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="grow-carousel-section"
      aria-label="Galería interactiva de agentes y momentos de AMY"
    >
      <svg
        className="grow-diagonal-slash"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="gc-slash-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c07a8b" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#ffb3ec" stopOpacity="1" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="68%" stopColor="#2ee6a8" stopOpacity="1" />
            <stop offset="100%" stopColor="#c07a8b" stopOpacity="0.95" />
          </linearGradient>
          <filter id="gc-slash-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>
        <line
          ref={slashAuraRef}
          x1="0"
          y1="100"
          x2="100"
          y2="118"
          stroke="url(#gc-slash-grad)"
          strokeWidth="16"
          strokeOpacity="0.42"
          vectorEffect="non-scaling-stroke"
          filter="url(#gc-slash-blur)"
        />
        <line
          ref={slashGlowRef}
          x1="0"
          y1="100"
          x2="100"
          y2="118"
          stroke="url(#gc-slash-grad)"
          strokeWidth="6"
          strokeOpacity="0.88"
          vectorEffect="non-scaling-stroke"
        />
        <line
          ref={slashCoreRef}
          x1="0"
          y1="100"
          x2="100"
          y2="118"
          stroke="#ffffff"
          strokeWidth="2.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div ref={stageRef} className="grow-portal-frame">
        {/* Fondo ambiental desenfocado reactivo */}
        <div className="grow-backdrop-stack" aria-hidden="true">
          {GROW_ITEMS.map((item, idx) => (
            <img
              key={item.id}
              ref={(el) => {
                backdropRefs.current[idx] = el;
              }}
              className="grow-backdrop-layer"
              src={item.img}
              alt=""
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ))}
          <div ref={ambientRef} className="grow-backdrop-ambient" />
        </div>
        <div className="grow-backdrop-vignette" aria-hidden="true" />

        <header className="grow-header">
          <div className="grow-eyebrow">THE AMY SHOW // GROW CAROUSEL</div>
          <h2 className="grow-title">
            Momentos, <span>Agentes</span> &amp; Clips
          </h2>
        </header>

        <div className="grow-viewport">
          <div ref={trackRef} className="grow-track">
            {SLOTS.map(({ slot, item }) => {
              const isFocusable = slot >= GROW_ITEMS.length * 2 && slot < GROW_ITEMS.length * 3;
              return (
                <article
                  key={slot}
                  ref={(el) => {
                    cardRefs.current[slot] = el;
                  }}
                  className="grow-card"
                  tabIndex={isFocusable ? 0 : -1}
                  style={{ background: item.fallbackBg }}
                >
                  <img
                    className="grow-card-media"
                    src={item.img}
                    alt={`${item.title} — ${item.subtitle}`}
                    draggable="false"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                  <span
                    ref={(el) => {
                      badgeRefs.current[slot] = el;
                    }}
                    className="grow-card-badge"
                  >
                    {item.badge}
                  </span>
                  <div
                    ref={(el) => {
                      shadeRefs.current[slot] = el;
                    }}
                    className="grow-card-shade"
                  />
                  <div
                    ref={(el) => {
                      ringRefs.current[slot] = el;
                    }}
                    className="grow-card-ring"
                  />
                  <div
                    ref={(el) => {
                      captionRefs.current[slot] = el;
                    }}
                    className="grow-card-caption"
                  >
                    <h3 className="grow-card-title">{item.title}</h3>
                    <p className="grow-card-sub">{item.subtitle}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
