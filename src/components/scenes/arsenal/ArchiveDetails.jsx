import { useId, useState, useEffect } from 'react';
import './archive-details.css';

const SECTIONS = [{ key: 'perfil', label: 'Perfil' }, { key: 'habilidades', label: 'Kit' }, { key: 'consejos', label: 'Tips' }];
const KEYS = ['C', 'Q', 'E', 'X'];

export function ArchivePortrait({ agent, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [agent.img]);
  return <div className={`archive-portrait ${className}`} data-portrait-failed={failed} style={{ background: agent.fallbackBg }}>
    {failed ? <div className="archive-portrait__fallback" role="img" aria-label={`Retrato de ${agent.name} no disponible`}><span>{agent.name}</span></div>
      : <img key={agent.img} data-card-portrait src={agent.img} alt={`Retrato de ${agent.name}`} draggable="false" decoding="async" onError={() => setFailed(true)} />}
  </div>;
}

export function ArchiveDetails({ agent, activeAbility, onAbilityChange, activeSection, onSectionChange }) {
  const id = useId(), guide = agent.guide;
  function sectionKeys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = SECTIONS.findIndex(section => section.key === event.target.closest('[data-section]')?.dataset.section);
    if (current < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key === 'ArrowRight' ? (current + 1) % 3 : event.key === 'ArrowLeft' ? (current + 2) % 3 : -1;
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation(); onSectionChange(SECTIONS[next].key);
    event.currentTarget.querySelectorAll('[data-section]')[next]?.focus({ preventScroll: true });
  }
  function abilityKeys(event, index) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : ['ArrowDown', 'ArrowRight'].includes(event.key) ? (index + 1) % 4 : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (index + 3) % 4 : -1;
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation(); onAbilityChange(KEYS[next]);
    event.currentTarget.closest('.archive-details__kit').querySelectorAll('[data-ability]')[next]?.focus();
  }
  return <div className="archive-details">
    <div className="archive-details__nav" role="tablist" aria-label={`Explorar archivo de ${agent.name}`} onKeyDown={sectionKeys}>
      {SECTIONS.map(section => <button key={section.key} type="button" role="tab" data-section={section.key}
        id={`${id}-tab-${section.key}`} aria-controls={`${id}-panel-${section.key}`} aria-selected={activeSection === section.key}
        tabIndex={activeSection === section.key ? 0 : -1} onClick={() => onSectionChange(section.key)}>{section.label}</button>)}
    </div>
    <div className="archive-details__body">
      <section role="tabpanel" id={`${id}-panel-perfil`} aria-labelledby={`${id}-tab-perfil`} hidden={activeSection !== 'perfil'} tabIndex={0} data-section-panel="perfil">
        <p className="archive-details__summary">{guide.summary}</p><h3>Te encaja si</h3><p>{guide.audience}</p>
        <ul className="archive-details__strengths" aria-label="Fortalezas">{guide.strengths.map(strength => <li key={strength}>{strength}</li>)}</ul>
      </section>
      <section className="archive-details__kit" role="tabpanel" id={`${id}-panel-habilidades`} aria-labelledby={`${id}-tab-habilidades`} hidden={activeSection !== 'habilidades'} data-section-panel="habilidades">
        {KEYS.map((key, index) => <div className="archive-details__skill" key={key} data-open={activeAbility === key}>
          <h3><button type="button" data-ability={key} id={`${id}-skill-${key}`} aria-expanded={activeAbility === key} aria-controls={`${id}-ability-${key}`}
            aria-label={`Habilidad ${key}: ${agent.abilities[key].name}`} onClick={() => onAbilityChange(key)} onKeyDown={event => abilityKeys(event, index)}>
            <span className="archive-details__key" aria-hidden="true">{key}</span>{' '}<span>{agent.abilities[key].name}</span>{' '}<span className="archive-details__sign" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" focusable="false"><path d="M1 6h10" />{activeAbility !== key && <path d="M6 1v10" />}</svg></span>
          </button></h3>
          <div className="archive-details__explanation" role="region" id={`${id}-ability-${key}`} aria-labelledby={`${id}-skill-${key}`} hidden={activeAbility !== key} data-ability-panel={key}>
            <p>{agent.abilities[key].desc}</p>
          </div>
        </div>)}
      </section>
      <section role="tabpanel" id={`${id}-panel-consejos`} aria-labelledby={`${id}-tab-consejos`} hidden={activeSection !== 'consejos'} tabIndex={0} data-section-panel="consejos">
        <ol className="archive-details__tips">{guide.tips.map((tip, index) => <li key={tip}><span aria-hidden="true">0{index + 1}</span><p>{tip}</p></li>)}</ol>
        <aside className="archive-details__caution"><h3>Ten en cuenta</h3><p>{guide.caution}</p></aside>
      </section>
    </div>
  </div>;
}
