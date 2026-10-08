import { useState } from 'react';
import WordReveal from '@/components/ui/WordReveal.jsx';
import AimTrainer from '@/components/sections/AimTrainer.jsx';
import { GEAR_DATA as GEAR, GEAR_FILTERS as FILTERS } from '@/data/gearData.js';

/* ── Bento Asimétrico 12-col (Opción A) ──────────────────────────── */
function GearBento({ items }) {
  const featured = items[0];
  const rest = items.slice(1);
  return (
    <div className="bga-grid">
      {featured && (
        <div className="bga-card bga-feat">
          <span className="bga-card-label">{featured.icon} {featured.name}</span>
          <span className="bga-card-value">{featured.value}</span>
          <span className="bga-card-spec">{featured.spec}</span>
          {featured.status && <span className="bga-card-status">{featured.status}</span>}
        </div>
      )}
      {rest.map((g, i) => {
        // Patrón: 4, 4, 4, 4, 8, 4, 4, 4, 8, 4
        const span = (i % 5 === 4) ? 'bga-wide' : 'bga-half';
        return (
          <div className={`bga-card ${span}`} key={g.name}>
            <span className="bga-card-label">{g.icon} {g.name}</span>
            <span className="bga-card-value">{g.value}</span>
            <span className="bga-card-spec">{g.spec}</span>
            {g.status && <span className="bga-card-status">{g.status}</span>}
            {g.bar && (
              <div className="bga-bar"><div className="bga-bar-fill" style={{ width: `${g.bar}%` }}></div></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SetupGear() {
  const [filter, setFilter] = useState('all');
  const items = filter === 'all' ? GEAR : GEAR.filter(g => g.cat === filter);

  return (
    <section id="gear" className="setup-gear fade-in-section">
      <div className="section-title">
        <WordReveal as="h2" parts={[{ t: 'Mi Setup' }, { t: '& Gear', hl: true }]} />
        <p>Herramientas de precisión para el máximo rendimiento.</p>
      </div>

      <div className="gear-filters" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <GearBento items={items} />
      </div>

      <AimTrainer />
    </section>
  );
}
