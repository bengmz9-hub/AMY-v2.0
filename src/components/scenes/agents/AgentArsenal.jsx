import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENTS, DEFAULT_ABILITIES } from '@/data/agentArsenal.js';
import HelixGallery from './HelixGallery.jsx';
import ArchiveCard from './arsenal/ArchiveCard.jsx';
import AgentIntro from './arsenal/AgentIntro.jsx';
import ParticleRoleIcon from './arsenal/ParticleRoleIcon.jsx';
import ParticleBackdrop from './arsenal/ParticleBackdrop.jsx';
import './arsenal/AgentArsenal.css';

const SECTIONS = { perfil: 'Perfil', habilidades: 'Habilidades', consejos: 'Consejos' };

export default function AgentArsenal({ enabled, prepareStartup = false, onStartupProgress }) {
  const root = useRef(null);
  const startup = useRef({ images: 'pending', roles: 'pending', background: 'pending' });
  const reportPart = useCallback((part, value) => {
    if (startup.current[part] === value) return;
    startup.current[part] = value;
    const values = Object.values(startup.current);
    if (values.every(state => state !== 'pending')) {
      onStartupProgress?.('arsenal', values.includes('fallback') ? 'fallback' : 'ready');
    }
  }, [onStartupProgress]);
  const rolesPrepared = useCallback(value => reportPart('roles', value), [reportPart]);
  const backgroundPrepared = useCallback(value => reportPart('background', value), [reportPart]);
  useEffect(() => {
    if (!prepareStartup) return;
    let active = true;
    const cleanups = [];
    const images = [...root.current.querySelectorAll('img')];
    Promise.all(images.map(image => new Promise(resolve => {
      const expected = image.src;
      const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
      const failed = () => { cleanup(); if (active && image.src === expected) image.style.visibility = 'hidden'; resolve(false); };
      const loaded = async () => {
        cleanup();
        if (!image.naturalWidth) { failed(); return; }
        try { await image.decode(); resolve(true); } catch { failed(); }
      };
      cleanups.push(cleanup);
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      if (image.complete) loaded();
    }))).then(results => { if (active) reportPart('images', results.every(Boolean) ? 'ready' : 'fallback'); });
    return () => { active = false; cleanups.forEach(cleanup => cleanup()); };
  }, [prepareStartup, reportPart]);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [abilities, setAbilities] = useState(DEFAULT_ABILITIES);
  const [sections, setSections] = useState(() => Object.fromEntries(AGENTS.map(agent => [agent.id, 'perfil'])));
  const agent = AGENTS[activeIndex];
  const activeAbility = abilities[agent.id], activeSection = sections[agent.id];

  return <div ref={root} className="agent-arsenal card-lab nebula-selected umbral-selected" data-variant="a" data-card-choice="b" data-background-choice="c">
    <ParticleBackdrop mode="c" paused={!enabled || paused} onPreference={setReduced} prepareStartup={prepareStartup} onPrepared={backgroundPrepared} />
    <div className="grow-layout">
      <div className="proposal-layout">
        <div className="lab-title">
          <p className="lab-eyebrow"><span /> EL ARSENAL DE AMY</p>
          <h2 id="arsenal-agent-name" data-agent-name>{agent.name}</h2>
          <p className="lab-origin">{agent.guide.origin}</p>
          <div className="arsenal-tools background-tools">
            <button type="button" data-pause-background aria-pressed={paused} disabled={reduced}
              onClick={() => setPaused(value => !value)}>{reduced ? 'Movimiento reducido' : paused ? 'Reanudar fondo' : 'Pausar fondo'}</button>
          </div>
        </div>
        <section className="lab-card" id="technical-card" aria-label="Ficha Umbral del personaje seleccionado" tabIndex={-1}>
          <ArchiveCard agent={agent} activeAbility={activeAbility} activeSection={activeSection}
            onAbilityChange={key => setAbilities(previous => ({ ...previous, [agent.id]: key }))}
            onSectionChange={section => setSections(previous => ({ ...previous, [agent.id]: section }))} />
          <p className="lab-live" role="status" aria-live="polite">{agent.name}. {SECTIONS[activeSection]}. Presentación de {agent.name} actualizada bajo la hélice.</p>
        </section>
        <section className="lab-gallery" aria-label="Hélice y presentación de los agentes">
          <div className="lab-helix"><HelixGallery items={AGENTS} activeIndex={activeIndex} onSelect={setActiveIndex}
            enabled={enabled} showHelp={false} portraitSize="large" /></div>
          <div className="lab-summary-host" id="agent-introduction">
            <AgentIntro agent={agent} variant="a">
              <ParticleRoleIcon role={agent.guide.role} agentId={agent.id} variant="a" enabled={enabled} prepareStartup={prepareStartup} onPrepared={rolesPrepared} />
            </AgentIntro>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
