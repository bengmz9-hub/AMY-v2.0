import { useEffect, useRef, useState } from 'react';
import AgentArsenal from './AgentArsenal.jsx';
import './GrowCarousel.css';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smoothstep = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

export default function AgentCarousel() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const slashAuraRef = useRef(null);
  const slashGlowRef = useRef(null);
  const slashCoreRef = useRef(null);
  const [interactive, setInteractive] = useState(false);

  const releaseNarrativeFocus = (event) => {
    if (!interactive) return;
    // A later touch gesture must not lose the previously tapped button's focus
    // halfway through the narrative move when the scene becomes inert.
    if (event.type === 'touchstart') {
      if (event.touches.length === 1 && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const scroller = event.currentTarget.querySelector('.grow-layout');
    const atEdge = event.deltaY > 0
      ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 : scroller.scrollTop <= 1;
    // The narrative hook cancels on blur. Release local button focus before it
    // starts the move, rather than halfway through when the outgoing scene is inert.
    if (atEdge && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
  };

  useEffect(() => {
    const sectionEl = sectionRef.current;
    const stageEl = stageRef.current;
    if (!sectionEl || !stageEl) return;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const heroEl = document.getElementById('amy');
    const flowExitHost = sectionEl.closest('.nebulosa-flow-exit');

    const applyWipeState = (rawVal) => {
      const yLeft = 100 - rawVal * 122;
      const yRight = 118 - rawVal * 122;
      sectionEl.style.setProperty('--enter', smoothstep(rawVal).toFixed(4));
      sectionEl.style.setProperty('--y-left', `${yLeft.toFixed(2)}%`);
      sectionEl.style.setProperty('--y-right', `${yRight.toFixed(2)}%`);
      stageEl.dataset.visible = String(rawVal > 0.001);
      stageEl.dataset.active = String(rawVal > 0.03);
      stageEl.dataset.settled = String(rawVal >= 0.996);
      sectionEl.dataset.wiping = String(rawVal > 0.004 && rawVal < 0.994);
      for (const ref of [slashAuraRef, slashGlowRef, slashCoreRef]) {
        ref.current?.setAttribute('y1', yLeft.toFixed(2));
        ref.current?.setAttribute('y2', yRight.toFixed(2));
      }
      const rect = stageEl.getBoundingClientRect();
      const enabled = rawVal >= 0.996 && rect.bottom > 0 && rect.top < innerHeight && !flowExitHost?.inert;
      // Set inert synchronously with the shared wipe; React also informs the child.
      stageEl.inert = !enabled;
      setInteractive(enabled);
    };

    const updateEnterBridge = () => {
      const staticEntrance = motionQuery.matches || heroEl?.dataset.static === 'true';
      sectionEl.dataset.static = String(staticEntrance);
      if (staticEntrance) { applyWipeState(1); return; }
      const heroStage = heroEl?.querySelector('.amy-stage');
      const heroPhase = heroStage?.dataset.phase || heroEl?.dataset.phase;
      // Gameplay still owns the screen until Hero has settled.
      if (heroPhase && heroPhase !== 'settled') { applyWipeState(0); return; }
      if (heroEl) {
        // Hero is the only visual clock: no second smoothing or animation loop.
        applyWipeState(clamp(Number(heroEl.dataset.wipe) || 0));
      } else {
        const rect = sectionEl.getBoundingClientRect();
        const span = Number(getComputedStyle(sectionEl).getPropertyValue('--gc-wipe-span')) || 1.85;
        applyWipeState(clamp(-rect.top / Math.max(1, innerHeight * span)));
      }
    };

    const visibility = new IntersectionObserver(updateEnterBridge);
    visibility.observe(stageEl);
    const stateObserver = new MutationObserver(updateEnterBridge);
    if (flowExitHost) stateObserver.observe(flowExitHost, { attributes: true, attributeFilter: ['inert'] });
    if (heroEl) stateObserver.observe(heroEl, { attributes: true, attributeFilter: ['data-static'] });
    updateEnterBridge();
    window.addEventListener('scroll', updateEnterBridge, { passive: true });
    window.addEventListener('resize', updateEnterBridge);
    window.addEventListener('amy-hero-wipe', updateEnterBridge);
    window.addEventListener('amy-hero-phase', updateEnterBridge);
    motionQuery.addEventListener('change', updateEnterBridge);
    // The native fragment lookup can run before React mounts this anchor.
    // Wait for the sibling chapter to measure its layout, then honor an initial deep link.
    const initialFragmentFrame = location.hash === '#agents' ? requestAnimationFrame(() => {
      sectionEl.querySelector('#agents')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }) : 0;
    return () => {
      cancelAnimationFrame(initialFragmentFrame);
      visibility.disconnect();
      stateObserver.disconnect();
      window.removeEventListener('scroll', updateEnterBridge);
      window.removeEventListener('resize', updateEnterBridge);
      window.removeEventListener('amy-hero-wipe', updateEnterBridge);
      window.removeEventListener('amy-hero-phase', updateEnterBridge);
      motionQuery.removeEventListener('change', updateEnterBridge);
    };
  }, []);

  return (
    <section ref={sectionRef} className="grow-carousel-section grow-helix-section" aria-label="Especialidades tácticas y agentes de AMY">
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

      <div ref={stageRef} className="grow-portal-frame" inert={!interactive} aria-hidden={!interactive}
        onWheelCapture={releaseNarrativeFocus} onTouchStartCapture={releaseNarrativeFocus}>
        <AgentArsenal enabled={interactive} />
      </div>
    </section>
  );
}
