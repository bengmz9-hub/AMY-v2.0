import { useId, useLayoutEffect, useRef } from 'react';
import './HelixGallery.css';

const modulo = (value, count) => ((value % count) + count) % count;
const nearestPhase = (index, phase, count) =>
  phase + modulo(index - phase + count / 2, count) - count / 2;

export default function HelixGallery({ items, activeIndex = 0, onSelect, enabled = true, showHelp = true, portraitSize = 'default' }) {
  const largePortraits = portraitSize === 'large';
  const count = items.length;
  const selected = count ? modulo(Math.round(activeIndex), count) : 0;
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const cardsRef = useRef([]);
  const pathRef = useRef(null);
  const controller = useRef(null);
  const propsRef = useRef({ selected, onSelect, enabled });
  const helpId = useId();

  useLayoutEffect(() => {
    propsRef.current = { selected, onSelect, enabled };
  });

  useLayoutEffect(() => {
    if (!count) return;
    const root = rootRef.current;
    const stage = stageRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let target = propsRef.current.selected;
    let visual = target;
    let frame = 0;
    let lastTime = 0;
    let drag = null;
    let suppressUntil = 0;
    let width = stage.clientWidth;
    let height = stage.clientHeight;
    let fitScale = 1;
    let cardWidth = 225;
    let cardHeight = 382;
    const available = () => propsRef.current.enabled && !document.hidden;

    // B reference: inclined spiral, with independent height and actual Z depth.
    function geometry(d, spacing = largePortraits && width >= 520 ? 1.44 : 1) {
      const mobile = width < 520;
      const theta = d * Math.PI * 2 / count;
      const radius = mobile ? 151 : Math.min(width * 0.34, 306);
      return {
        x: (Math.sin(theta) * radius - d * (mobile ? 13 : 20)) * fitScale * spacing,
        y: (-d * (largePortraits ? (mobile ? 54 : 72) : (mobile ? 76 : 104)) - Math.sin(theta) * (mobile ? 12 : 21)) * fitScale,
        z: (Math.cos(theta) - 1) * (mobile ? 174 : 245) * fitScale,
        theta,
      };
    }

    function paint() {
      cardsRef.current.slice(0, count).forEach((card, index) => {
        if (!card) return;
        const d = modulo(index - visual + count / 2, count) - count / 2;
        const g = geometry(d);
        const distance = Math.abs(d);
        card.style.transform = `translate(-50%, -50%) translate3d(${g.x}px, ${g.y}px, ${g.z}px) rotateY(${-Math.sin(g.theta) * 43}deg) rotateZ(${-d * 5}deg)`;
        card.style.opacity = Math.min(1, Math.max(0, (count / 2 - distance) / 0.4));
        card.style.zIndex = Math.round(100 + g.z / 10);
        card.style.setProperty('--helix-light', String(0.98 - distance * 0.19));
      });
      const points = [];
      for (let d = -count / 2; d <= count / 2; d += 0.04) {
        const g = geometry(d);
        const perspective = 1200 / (1200 - g.z);
        points.push(`${(width * 0.5 + g.x * perspective).toFixed(2)},${(height * 0.5 + g.y * perspective).toFixed(2)}`);
      }
      pathRef.current?.setAttribute('d', `M${points.join(' L')}`);
    }

    function stopFrame() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    }

    function animate(time) {
      frame = 0;
      const dt = lastTime ? Math.min(50, time - lastTime) : 1000 / 60;
      lastTime = time;
      visual += (target - visual) * (1 - Math.pow(1 - 0.095, dt / (1000 / 60)));
      if (Math.abs(target - visual) < 0.001) visual = target;
      paint();
      if (visual !== target && available() && !reduced.matches) frame = requestAnimationFrame(animate);
      else lastTime = 0;
    }

    function run() {
      if (reduced.matches || !available()) {
        stopFrame();
        visual = target;
        paint();
      } else if (!frame) frame = requestAnimationFrame(animate);
    }

    function endDrag() {
      const ended = drag;
      drag = null;
      stage.classList.remove('helix-dragging');
      if (ended && stage.hasPointerCapture(ended.id)) stage.releasePointerCapture(ended.id);
      return ended;
    }

    function cancelDrag() {
      const ended = endDrag();
      if (!ended) return;
      if (ended.horizontal) suppressUntil = performance.now() + 500;
      target = ended.origin;
      run();
    }

    function selectPhase(value) {
      if (!available()) return;
      endDrag();
      target = value;
      const index = modulo(Math.round(value), count);
      propsRef.current.onSelect?.(index);
      run();
      return index;
    }

    const select = (index) => selectPhase(nearestPhase(index, visual, count));
    const step = (direction) => selectPhase(Math.round(target) + direction);
    function sync() {
      if (!available()) cancelDrag();
      const index = propsRef.current.selected;
      // Preserve the unwrapped target when the parent confirms our selection.
      if (!drag && modulo(Math.round(target), count) !== index) {
        target = nearestPhase(index, visual, count);
      }
      run();
    }

    function down(event) {
      if (!available() || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      cancelDrag();
      suppressUntil = 0;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: Math.round(target), delta: 0, horizontal: false };
    }
    function move(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.horizontal) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) { endDrag(); return; }
        if (Math.abs(dx) < 8) return;
        drag.horizontal = true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('helix-dragging');
      }
      drag.delta = dx;
      if (!reduced.matches) {
        target = drag.origin - dx / Math.max(130, Math.min(260, width * 0.5));
        run();
      }
    }
    function up(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const ended = endDrag();
      if (!ended.horizontal) return;
      suppressUntil = performance.now() + 500;
      let snap = reduced.matches ? ended.origin : Math.round(target);
      if (Math.abs(ended.delta) > 36 && snap === ended.origin) snap = ended.origin - Math.sign(ended.delta);
      selectPhase(snap);
    }
    function cancel(event) {
      // Touch starts with implicit capture on the button. Its bubbling loss is
      // expected when horizontal dragging transfers capture to the stage.
      if (event.type === 'lostpointercapture' && event.target !== stage) return;
      if (drag && drag.id === event.pointerId) cancelDrag();
    }
    function captureClick(event) {
      if (event.detail && performance.now() < suppressUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function motionChanged() { cancelDrag(); run(); }
    function visibilityChanged() { cancelDrag(); sync(); }
    function resize() {
      width = stage.clientWidth;
      height = stage.clientHeight;
      cardWidth = largePortraits ? (width < 520 ? 280 : 400) : (width < 520 ? 205 : Math.min(290, Math.max(225, width * 0.3)));
      cardHeight = largePortraits ? (width < 520 ? 420 : 600) : (width < 520 ? 280 : 382);
      const orbitCardWidth = largePortraits ? (width < 520 ? 235 : 300) : cardWidth;
      const orbitCardHeight = largePortraits ? (width < 520 ? 352 : 450) : cardHeight;
      fitScale = 1;
      let fit = 1;
      // Keep fitting independent of the larger portraits and their visual spacing.
      // Fit the reference corners with s*position*P/(P-s*z), including rotation.
      for (let d = -count / 2; d <= count / 2; d += 0.04) {
        const g = geometry(d, 1);
        const ry = -Math.sin(g.theta) * 43 * Math.PI / 180;
        const rz = -d * 5 * Math.PI / 180;
        for (const x of [-orbitCardWidth / 2, orbitCardWidth / 2]) {
          for (const y of [-orbitCardHeight / 2, orbitCardHeight / 2]) {
            const rx = x * Math.cos(rz) - y * Math.sin(rz);
            const py = g.y + x * Math.sin(rz) + y * Math.cos(rz);
            const px = g.x + rx * Math.cos(ry);
            const z = g.z - rx * Math.sin(ry);
            for (const [position, extent] of [[px, width], [py, height]]) {
              const limit = Math.max(0, extent / 2 - 8);
              const denominator = Math.abs(position) * 1200 + limit * z;
              if (denominator > 0) fit = Math.min(fit, limit * 1200 / denominator);
            }
          }
        }
      }
      fitScale = fit;
      stage.style.setProperty('--helix-card-width', `${cardWidth * fit}px`);
      stage.style.setProperty('--helix-card-height', `${cardHeight * fit}px`);
      paint();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('lostpointercapture', cancel);
    root.addEventListener('click', captureClick, true);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', visibilityChanged);
    reduced.addEventListener('change', motionChanged);
    controller.current = { select, step, sync };
    resize();

    return () => {
      endDrag();
      stopFrame();
      observer.disconnect();
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('lostpointercapture', cancel);
      root.removeEventListener('click', captureClick, true);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancelDrag);
      document.removeEventListener('visibilitychange', visibilityChanged);
      reduced.removeEventListener('change', motionChanged);
      controller.current = null;
    };
  }, [count, largePortraits]);

  useLayoutEffect(() => { controller.current?.sync(); }, [selected, enabled, count]);

  if (!count) return null;

  return (
    <div
      className="helix-gallery"
      ref={rootRef}
      role="region"
      aria-roledescription="carrusel"
      aria-label="Galería de agentes"
      aria-describedby={showHelp ? helpId : undefined}
      inert={!enabled}
      onKeyDown={(event) => {
        if (!enabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          const index = controller.current?.step(event.key === 'ArrowRight' ? 1 : -1);
          if (cardsRef.current.includes(event.target)) {
            cardsRef.current[index]?.focus({ preventScroll: true });
          }
        }
      }}
    >
      <div className="helix-stage" ref={stageRef}>
        <span className="helix-axis" aria-hidden="true" />
        <svg className="helix-path" aria-hidden="true"><path ref={pathRef} /></svg>
        {items.map((item, index) => (
          <button
            className="helix-portrait"
            key={item.id}
            ref={(node) => { cardsRef.current[index] = node; }}
            type="button"
            disabled={!enabled}
            tabIndex={selected === index ? 0 : -1}
            aria-label={`${item.name}, ${String(index + 1).padStart(2, '0')} de ${count}`}
            aria-pressed={selected === index}
            style={{ background: item.fallbackBg }}
            onClick={() => controller.current?.select(index)}
          >
            <img key={item.img} src={item.img} alt="" draggable="false" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
            <span className="helix-matte" aria-hidden="true" />
            <span className="helix-caption" aria-hidden="true"><span>{item.name}</span>{' '}<span>{String(index + 1).padStart(2, '0')}</span></span>
          </button>
        ))}
      </div>
      <div className="helix-controls">
        <p className="helix-current" aria-live={enabled ? 'polite' : 'off'} aria-atomic="true">
          <span className="helix-counter">{String(selected + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
          <span className="helix-name">{items[selected].name}</span>
        </p>
        <nav className="helix-navigation" aria-label="Recorrer agentes">
          <button className="helix-arrow" type="button" disabled={!enabled} aria-label="Agente anterior" onClick={() => controller.current?.step(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" /></svg></button>
          <button className="helix-arrow" type="button" disabled={!enabled} aria-label="Agente siguiente" onClick={() => controller.current?.step(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button>
        </nav>
      </div>
      {showHelp && <p className="helix-help" id={helpId}>Selecciona un retrato, arrastra o usa las flechas</p>}
    </div>
  );
}
