// Stats — bento grid con stagger al entrar (estilo Folira).
// Datos de juego, sin identificadores de cuentas sociales.
// CSS: .stats-section .bento-card (stagger) en index.css.
import { useEffect, useRef } from 'react';
import { STATS_DATA as STATS } from '@/data/statsData.jsx';

export default function Stats() {
  const sectionRef = useRef(null);

  // Stagger: las tarjetas entran en cascada cuando la sección entra en el viewport
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('stats-in');
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => el.classList.toggle('stats-in', e.isIntersecting));
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="stats" ref={sectionRef} className="stats-section" aria-label="Estadísticas de rendimiento y agentes">
      <h2 className="sr-only">Rendimiento táctico y agentes principales</h2>
      <div className="bento-grid">
        {STATS.map((stat, i) => (
          <div className="bento-card" key={stat.label} style={{ transitionDelay: i * 90 + 'ms' }}>
            <div className="bento-card-accent" />
            <div className="bento-card-icon">{stat.icon}</div>
            <span className="bento-card-number">{stat.value}</span>
            <span className="bento-card-label">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
