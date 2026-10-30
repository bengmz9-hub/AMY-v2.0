import { useEffect, useRef, useState } from 'react';
import { AGENTS_DATA } from '@/data/agentsData.js';
import './GrowCarousel.css';

const asset = (name) => `${import.meta.env.BASE_URL}assets/images/agents/${name}`;
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smoothstep = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

const AGENT_META = {
  sage: {
    title: 'Sage // Orbe Místico',
    subtitle: 'Main Sentinel · 45% Uso',
    badge: 'SENTINEL // MAIN · 45%',
    img: asset('sage-mystic-portrait.jpg'),
    accent: '#2ee6a8',
    ringGlow: 'rgba(46, 230, 168, 0.34)',
    fallbackBg: 'radial-gradient(circle at 50% 35%, #e5dfd3 0%, #2d5a52 62%, #0c1414 100%)',
  },
  gekko: {
    title: 'Gekko // Wingman',
    subtitle: 'Initiator · 35% Uso',
    badge: 'INITIATOR // 35%',
    img: asset('gekko-mystic-portrait.jpg'),
    accent: '#a3e635',
    ringGlow: 'rgba(163, 230, 53, 0.34)',
    fallbackBg: 'radial-gradient(circle at 50% 35%, #e5eee2 0%, #2b592c 62%, #0d1710 100%)',
  },
  brimstone: {
    title: 'Brimstone // Orbital',
    subtitle: 'Controller · 20% Uso',
    badge: 'CONTROLLER // 20%',
    img: asset('brimstone-mystic-portrait.jpg'),
    accent: '#ff8c3b',
    ringGlow: 'rgba(255, 140, 59, 0.34)',
    fallbackBg: 'radial-gradient(circle at 50% 35%, #eee5da 0%, #632810 62%, #170a06 100%)',
  },
};

const EXTRA_MYSTIC_AGENTS = [
  {
    id: 'phoenix',
    name: 'PHOENIX',
    title: 'Phoenix // Llama Solar',
    subtitle: 'Duelist · Pocket Pick',
    badge: 'DUELIST // SOLAR',
    img: asset('phoenix-mystic-portrait.jpg'),
    accent: '#ffae34',
    ringGlow: 'rgba(255, 174, 52, 0.36)',
    fallbackBg: 'radial-gradient(circle at 50% 35%, #f5e6d4 0%, #6b3410 62%, #170b05 100%)',
    desc: 'Entrada agresiva y autosuficiencia con fuego solar. Ideal para abrir ángulos con flashes rápidos y reiniciar duelos.',
    emoji: '☀️',
    usageLabel: 'Rol táctico',
    usageValue: 'DUELIST · FLEX',
    barWidth: 100,
    gradient: 'linear-gradient(90deg, #ff7b00, #ffd05b)',
    abilities: {
      C: {
        name: 'Llamarada (Control)',
        desc: 'Muro de fuego que bloquea visión y me cura al atravesarlo para ganar espacio.',
      },
      Q: {
        name: 'Bola Curva (Q)',
        desc: 'Flash rápida en esquina para salir a buscar el primer duelo con ventaja.',
      },
      E: {
        name: 'Manos Calientes (E)',
        desc: 'Bola de fuego para limpiar posiciones cerradas o regenerar vida tras un intercambio.',
      },
      X: {
        name: 'Cenizas (X)',
        desc: 'Segunda vida para entrar primero al site, sacar información y forzar rotaciones.',
      },
    },
  },
  {
    id: 'chamber',
    name: 'CHAMBER',
    title: 'Chamber // Tour de Force',
    subtitle: 'Sentinel · Pocket Pick',
    badge: 'SENTINEL // GOLD',
    img: asset('chamber-mystic-portrait.jpg'),
    accent: '#e5c168',
    ringGlow: 'rgba(229, 193, 104, 0.36)',
    fallbackBg: 'radial-gradient(circle at 50% 35%, #f0eadc 0%, #4f4124 62%, #120f0a 100%)',
    desc: 'Precisión letal y control de flancos. Especialista en sostener líneas largas con reposicionamiento instantáneo.',
    emoji: '⚜️',
    usageLabel: 'Rol táctico',
    usageValue: 'HOLD · FLEX',
    barWidth: 100,
    gradient: 'linear-gradient(90deg, #b88933, #f3d78b)',
    abilities: {
      C: {
        name: 'Marca Registrada (Control)',
        desc: 'Trampa que detecta y ralentiza flancos enemigos mientras vigilo el ángulo principal.',
      },
      Q: {
        name: 'Cazador de Cabezas (Q)',
        desc: 'Pistola pesada de alta precisión para rondas eco y tiros limpios a larga distancia.',
      },
      E: {
        name: 'Rendezvous (E)',
        desc: 'Ancla de teletransporte para buscar el primer pick agresivo y salir sin castigo.',
      },
      X: {
        name: 'Tour de Force (X)',
        desc: 'Rifle de francotirador definitivo que genera campo de ralentización con cada baja.',
      },
    },
  },
];

const GROW_ITEMS = [
  ...AGENTS_DATA.map((agent) => {
    const meta = AGENT_META[agent.id] || {};
    return {
      ...agent,
      ...meta,
      usageLabel: 'Tasa de uso',
      usageValue: `${agent.percent}%`,
      barWidth: agent.percent,
    };
  }),
  ...EXTRA_MYSTIC_AGENTS,
];

const ABILITY_KEYS = ['C', 'Q', 'E', 'X'];

const CONFIG = {
  copies: 6,
  idleDriftPxPerSec: 15,
  maxSteerPxPerSec: 90,
  mouseImpulseGain: 0.4,
  growScale: 1.2,
  extraPartGap: 8,
  lerpRate: 0.1,
  dimOpacity: 0.46,
  idleOpacity: 0.92,
};

const SLOTS = Array.from({ length: GROW_ITEMS.length * CONFIG.copies }, (_, slot) => ({
  slot,
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

  const [activeAbilities, setActiveAbilities] = useState(() => ({
    sage: 'C',
    gekko: 'Q',
    brimstone: 'E',
    phoenix: 'Q',
    chamber: 'E',
  }));

  const selectAbility = (agentId, key, e) => {
    if (e) e.stopPropagation();
    setActiveAbilities((prev) => (prev[agentId] === key ? prev : { ...prev, [agentId]: key }));
  };

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
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let hoveredSlot = -1;
    let focusedSlot = -1;
    let hoverPresence = 0;
    let scrollOffset = 0;
    let velocityPxPerSec = CONFIG.idleDriftPxPerSec;
    let impulseOffset = 0;
    let isVisible = true;
    let pointerOverHud = false;
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

    // Inicializar en el ciclo central (2 * singleCycleWidth de 6 copias)
    const initMetrics = getCardMetrics();
    scrollOffset = n * initMetrics.step * 2;

    let targetRaw = 0;
    let smoothedRaw = 0;
    let wipeInit = false;
    const isInteractive = () => targetRaw >= 0.996 && smoothedRaw >= 0.996;

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
      const heroEl = document.getElementById('amy');
      const staticEntrance = motionQuery.matches || heroEl?.dataset.static === 'true';
      sectionEl.dataset.static = String(staticEntrance);
      startLoop();
      if (staticEntrance) {
        targetRaw = 1;
        smoothedRaw = 1;
        wipeInit = true;
        applyWipeState(1);
        return;
      }

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

      if (
        !wipeInit ||
        (targetRaw >= 0.98 && smoothedRaw < 0.15) ||
        (targetRaw <= 0.02 && smoothedRaw > 0.85)
      ) {
        smoothedRaw = targetRaw;
        wipeInit = true;
        applyWipeState(smoothedRaw);
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
      if (focusedSlot !== -1 || !pointerPos.active) {
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
      rafId = 0;
      const wipingPending = Math.abs(targetRaw - smoothedRaw) > 0.0003;
      if (!isVisible && !wipingPending) {
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const reducedMotion = motionQuery.matches;
      const lerpFactor = reducedMotion ? 1 : 1 - Math.pow(1 - CONFIG.lerpRate, dt * 60);
      const lerpWipe = 1 - Math.pow(1 - 0.085, dt * 60);

      if (!reducedMotion) {
        smoothedRaw += (targetRaw - smoothedRaw) * lerpWipe;
        if (Math.abs(targetRaw - smoothedRaw) < 0.0003) {
          smoothedRaw = targetRaw;
        }
        applyWipeState(smoothedRaw);
      }

      const { cardW, gap, step } = getCardMetrics();
      const interactive = isInteractive();
      if (interactive) {
        updateHoveredSlotFromPointer(gap);
      } else {
        // Keep hover stable while the scroll transform moves/clips the cards.
        if (smoothedRaw <= 0.001) {
          hoveredSlot = -1;
          pointerPos.active = false;
          pointerOverHud = false;
          hoverPresence = 0;
          progresses.fill(0);
        }
      }

      let targetVelocity = CONFIG.idleDriftPxPerSec;
      if (reducedMotion || pointerOverHud || focusedSlot !== -1) {
        targetVelocity = 0;
      } else if (pointerPos.active) {
        const normX = (pointerPos.x / Math.max(1, window.innerWidth) - 0.5) * 2;
        const shaped = Math.sign(normX) * Math.pow(Math.abs(normX), 1.6);
        const inspectDamp = hoveredSlot !== -1 ? 0.35 : 1;
        targetVelocity = shaped * CONFIG.maxSteerPxPerSec * inspectDamp;
      }

      velocityPxPerSec += (targetVelocity - velocityPxPerSec) * lerpFactor;

      if (reducedMotion) impulseOffset = 0;
      const impulseStep = impulseOffset * Math.min(1, dt * 8);
      impulseOffset -= impulseStep;

      scrollOffset += velocityPxPerSec * dt + impulseStep;

      const singleCycleWidth = n * step;
      while (scrollOffset >= singleCycleWidth * 4) {
        scrollOffset -= singleCycleWidth;
        shiftCycleBackward();
      }
      while (scrollOffset < singleCycleWidth * 2) {
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
        const baseBright = 0.94 - hoverPresence * 0.3;
        const brightness = baseBright + p * (1.03 - baseBright);

        const cardEl = cardRefs.current[i];
        if (cardEl) {
          cardEl.style.transform = `translate3d(${shiftX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
          cardEl.style.opacity = opacity.toFixed(3);
          cardEl.style.filter = `brightness(${brightness.toFixed(3)})`;
          cardEl.style.zIndex = p > 0.05 ? String(10 + Math.round(p * 20)) : '1';
          cardEl.dataset.expanded = p > 0.45 ? 'true' : 'false';
        }

        const shadeEl = shadeRefs.current[i];
        if (shadeEl) shadeEl.style.opacity = (0.28 + p * 0.72).toFixed(3);

        const ringEl = ringRefs.current[i];
        if (ringEl) ringEl.style.opacity = p.toFixed(3);

        const captionEl = captionRefs.current[i];
        if (captionEl) {
          captionEl.style.setProperty('--p', p.toFixed(3));
        }

        const badgeEl = badgeRefs.current[i];
        if (badgeEl) {
          badgeEl.style.opacity = (0.78 + p * 0.22).toFixed(3);
          badgeEl.style.transform = `translate3d(0, ${((1 - p) * -3).toFixed(2)}px, 0)`;
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

      if (!reducedMotion) rafId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      pointerOverHud = Boolean(target && target.closest('.grow-card-tactical'));
      if (pointerPos.active && !pointerOverHud && !motionQuery.matches) {
        const dx = e.clientX - pointerPos.x;
        impulseOffset += dx * CONFIG.mouseImpulseGain;
      }
      pointerPos.x = e.clientX;
      pointerPos.y = e.clientY;
      pointerPos.active = true;
      startLoop();
    };

    const onPointerLeave = () => {
      pointerPos.active = false;
      pointerOverHud = false;
      if (isInteractive()) hoveredSlot = focusedSlot;
      startLoop();
    };

    const onFocusIn = (e) => {
      const card = e.target instanceof Element ? e.target.closest('.grow-card') : null;
      if (!card) return;
      const idx = cardRefs.current.indexOf(card);
      if (idx !== -1) {
        focusedSlot = idx;
        if (isInteractive()) hoveredSlot = idx;
        startLoop();
      }
    };

    const onFocusOut = (e) => {
      const next = e.relatedTarget instanceof Element ? e.relatedTarget.closest('.grow-card') : null;
      if (!next) {
        focusedSlot = -1;
        if (isInteractive() && !pointerPos.active) hoveredSlot = -1;
        startLoop();
      }
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
    motionQuery.addEventListener('change', updateEnterBridge);
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
      motionQuery.removeEventListener('change', updateEnterBridge);
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
      aria-label="Especialidades tácticas y agentes de AMY"
    >
      <div id="agents" className="grow-carousel-anchor" aria-hidden="true" />
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
          <div className="grow-eyebrow">THE AMY SHOW // ESPECIALIDADES TÁCTICAS</div>
          <h2 className="grow-title">
            Agentes, <span>Sinergia</span> &amp; Control
          </h2>
        </header>

        <div className="grow-viewport">
          <div ref={trackRef} className="grow-track">
            {SLOTS.map(({ slot, item }) => {
              const isPrimaryCycle = slot >= GROW_ITEMS.length * 2 && slot < GROW_ITEMS.length * 3;
              const activeKey = activeAbilities[item.id] || 'C';
              const currentAbility = item.abilities?.[activeKey] || item.abilities?.C;

              return (
                <article
                  key={slot}
                  ref={(el) => {
                    cardRefs.current[slot] = el;
                  }}
                  className="grow-card"
                  data-agent={item.id}
                  tabIndex={isPrimaryCycle ? 0 : -1}
                  style={{
                    background: item.fallbackBg,
                    '--agent-accent': item.accent,
                    '--agent-ring-glow': item.ringGlow,
                  }}
                >
                  <img
                    className="grow-card-media"
                    src={item.img}
                    alt={`${item.name} — ${item.subtitle}`}
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
                    <i className="grow-card-badge-dot" aria-hidden="true" />
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
                    <div className="grow-card-head">
                      <h3 className="grow-card-title">{item.title}</h3>
                      <p className="grow-card-sub">{item.subtitle}</p>
                    </div>

                    <div className="grow-card-tactical">
                      <p className="grow-card-desc">{item.desc}</p>

                      {item.abilities && currentAbility && (
                        <div className="grow-abilities-box">
                          <div
                            className="grow-ability-tabs"
                            role="tablist"
                            aria-label={`Habilidades tácticas de ${item.name}`}
                          >
                            {ABILITY_KEYS.map((key) => {
                              const isSelected = activeKey === key;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  role="tab"
                                  tabIndex={isPrimaryCycle ? 0 : -1}
                                  aria-selected={isSelected}
                                  aria-label={`Habilidad ${key}: ${item.abilities[key]?.name}`}
                                  className={`grow-ability-tab ${isSelected ? 'is-active' : ''}`}
                                  onClick={(e) => selectAbility(item.id, key, e)}
                                >
                                  {key === 'C' ? 'Ctrl' : key}
                                </button>
                              );
                            })}
                          </div>
                          <div className="grow-ability-detail" role="tabpanel">
                            <h4 className="grow-ability-name">{currentAbility.name}</h4>
                            <p className="grow-ability-text">{currentAbility.desc}</p>
                          </div>
                        </div>
                      )}

                      <div className="grow-usage">
                        <div className="grow-usage-head">
                          <span>
                            {item.emoji} {item.usageLabel}
                          </span>
                          <strong>{item.usageValue}</strong>
                        </div>
                        <div className="grow-usage-track">
                          <div
                            className="grow-usage-fill"
                            style={{ width: `${item.barWidth}%`, background: item.gradient }}
                          />
                        </div>
                      </div>
                    </div>
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
