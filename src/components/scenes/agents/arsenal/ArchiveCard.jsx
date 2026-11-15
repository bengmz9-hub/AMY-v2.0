import { ArchiveDetails, ArchivePortrait } from './ArchiveDetails.jsx';
import './ArchiveCard.css';

export default function ArchiveCard({ agent, activeAbility, onAbilityChange, activeSection, onSectionChange }) {
  const alias = agent.title.split('//').slice(1).join('//').trim();

  return <article className="archive-b" data-agent-card="b" data-agent-id={agent.id} aria-label={`Archivo de ${agent.name}`}>
    <ArchivePortrait agent={agent} className="archive-b__portrait" />
    <div className="archive-b__opening" aria-hidden="true" />
    <div className="archive-b__sheet">
      <header className="archive-b__identity">
        <p className="archive-b__provenance"><span>{agent.guide.role}</span><span>{agent.guide.origin}</span></p>
        <h2 className="archive-b__name">{agent.name}</h2>
        <p className="archive-b__alias">{alias}</p>
      </header>
      <ArchiveDetails agent={agent} activeAbility={activeAbility} onAbilityChange={onAbilityChange}
        activeSection={activeSection} onSectionChange={onSectionChange} />
      <footer className="archive-b__footer">
        <p>Lectura editorial <span>AMY</span></p>
        <a href={agent.guide.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ficha oficial de ${agent.name} en VALORANT (abre otra pestaña)`}>
          Ficha oficial <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </div>
  </article>;
}
