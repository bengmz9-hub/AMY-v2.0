import './agent-intro.css';

export default function AgentIntro({ agent, variant, children }) {
  return (
    <section className="agent-intro" data-agent-summary={variant} data-agent-id={agent.id}
      aria-label={`Presentación de ${agent.name}`}>
      <div className="agent-intro__icon">{children}</div>
      <div className="agent-intro__copy">
        <h2 className="agent-intro__role" data-summary-role>{agent.guide.role}</h2>
        <div className="agent-intro__body">
          <p className="agent-intro__bio" data-summary-bio>{agent.bio}</p>
          <a className="agent-intro__source" href={agent.guide.sourceUrl} target="_blank" rel="noopener noreferrer"
            aria-label={`Perfil oficial en VALORANT de ${agent.name} (abre en otra pestaña)`}>
            Perfil oficial en VALORANT <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
