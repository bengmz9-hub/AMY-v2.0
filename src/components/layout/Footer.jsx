import React from 'react';
import { PROFILE, SOCIAL_LINKS } from '@/data/profile.js';

export default function Footer() {
  const scrollToTop = () => {
    const rootEl = document.getElementById('root') || document.documentElement;
    rootEl.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="footer-hud" role="contentinfo" aria-label="Pie de página táctico">
      {/* Barra de telemetría superior */}
      <div className="hud-top-bar">
        <div className="hud-status">
          <span className="hud-led-platino" aria-hidden="true" />
          <span className="hud-status-text">{PROFILE.statusText}</span>
        </div>
        <div className="hud-telemetry-pill">
          <span>PROTOCOL: ACTIVE</span>
          <span className="hud-sep" aria-hidden="true">|</span>
          <span className="text-platino">{PROFILE.telemetry}</span>
        </div>
      </div>

      {/* Cuadrícula de 4 módulos tácticos */}
      <div className="hud-grid">
        {/* Módulo 1: Identidad & Callsign */}
        <div className="hud-module">
          <div className="hud-corner top-l" aria-hidden="true" /><div className="hud-corner top-r" aria-hidden="true" />
          <div className="hud-corner bot-l" aria-hidden="true" /><div className="hud-corner bot-r" aria-hidden="true" />
          <div className="hud-mod-header">
            <span className="hud-mod-num">01</span>
            <span className="hud-mod-tag">IDENT // PROTOCOL</span>
          </div>
          <h3 className="hud-title">{PROFILE.name}</h3>
          <p className="hud-desc">{PROFILE.role}</p>
          <div className="hud-callsign-box">
            <span>{PROFILE.callsign}</span>
            <span className="text-platino">RANK: {PROFILE.rankUpper}</span>
          </div>
        </div>

        {/* Módulo 2: Navegación Táctica */}
        <nav className="hud-module" aria-label="Navegación de protocolo">
          <div className="hud-corner top-l" aria-hidden="true" /><div className="hud-corner top-r" aria-hidden="true" />
          <div className="hud-corner bot-l" aria-hidden="true" /><div className="hud-corner bot-r" aria-hidden="true" />
          <div className="hud-mod-header">
            <span className="hud-mod-num">02</span>
            <span className="hud-mod-tag">SECTORES // NAV</span>
          </div>
          <ul className="hud-nav-list">
            <li><a href="#agents" className="hud-nav-link"><span className="hud-bullet">&gt;</span> [01] Especialidades</a></li>
            <li><a href="#gear" className="hud-nav-link"><span className="hud-bullet">&gt;</span> [02] Setup Gaming</a></li>
            <li><a href="#shorts" className="hud-nav-link"><span className="hud-bullet">&gt;</span> [03] The Amy Show</a></li>
            <li><a href="#sensCanvas" className="hud-nav-link"><span className="hud-bullet">&gt;</span> [04] Aim Trainer</a></li>
          </ul>
        </nav>

        {/* Módulo 3: Redes & Transmisión */}
        <div className="hud-module">
          <div className="hud-corner top-l" aria-hidden="true" /><div className="hud-corner top-r" aria-hidden="true" />
          <div className="hud-corner bot-l" aria-hidden="true" /><div className="hud-corner bot-r" aria-hidden="true" />
          <div className="hud-mod-header">
            <span className="hud-mod-num">03</span>
            <span className="hud-mod-tag">COMMS // RADAR</span>
          </div>
          <div className="hud-social-stack">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hud-social-item"
                aria-label={`${social.label} oficial de Amy (${social.handle})`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={social.path} />
                </svg>
                <span>{social.footerLabel}</span>
                <span className="hud-link-arrow" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </div>

        {/* Módulo 4: Telemetría de Combate */}
        <div className="hud-module">
          <div className="hud-corner top-l" aria-hidden="true" /><div className="hud-corner top-r" aria-hidden="true" />
          <div className="hud-corner bot-l" aria-hidden="true" /><div className="hud-corner bot-r" aria-hidden="true" />
          <div className="hud-mod-header">
            <span className="hud-mod-num">04</span>
            <span className="hud-mod-tag">STATS // COMBAT</span>
          </div>
          <div className="hud-stat-row">
            <span className="hud-stat-label">HORAS JUGADAS:</span>
            <span className="hud-stat-val text-platino">{PROFILE.hoursPlayed}</span>
          </div>
          <div className="hud-stat-row">
            <span className="hud-stat-label">K/D RATIO:</span>
            <span className="hud-stat-val text-pink">{PROFILE.kdRatio}</span>
          </div>
          <div className="hud-stat-row">
            <span className="hud-stat-label">RESURRECTS:</span>
            <span className="hud-stat-val">{PROFILE.resurrects}</span>
          </div>
        </div>
      </div>

      {/* Barra de pie con botón Volver Arriba */}
      <div className="hud-bottom-bar">
        <p className="hud-copy">© 2026 AMY // VALORANT PROTOCOL • ALL RIGHTS RESERVED</p>
        <button
          type="button"
          onClick={scrollToTop}
          className="hud-top-btn"
          aria-label="Volver al inicio de la página"
        >
          <span>RECON OVERWATCH ▲</span>
        </button>
      </div>
    </footer>
  );
}
