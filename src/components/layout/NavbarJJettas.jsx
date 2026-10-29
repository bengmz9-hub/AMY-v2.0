import { useEffect, useRef, useState } from 'react';
import './navbar-jjettas.css';

const LINK_ROWS = [
  [
    { href: '#amy', label: 'Inicio' },
    { href: '#agents', label: 'Especialidades' },
    { href: '#gear', label: 'Setup & Gear' },
    { href: '#sensCanvas', label: 'Aim Trainer' },
  ],
  [
    { href: '#shorts', label: 'Amy Show' },
    { href: '#stats', label: 'Estadísticas' },
    { href: 'https://www.twitch.tv/amyjgil', label: 'Directos', external: true },
  ],
];

const SOCIALS = [
  { label: 'TikTok', href: 'https://www.tiktok.com/@amyjgil', path: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z' },
  { label: 'YouTube', href: 'https://www.youtube.com/@AmyJGil', path: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z' },
  { label: 'Twitch', href: 'https://www.twitch.tv/amyjgil', path: 'M11.57 4.71h1.71v5.14h-1.71zm4.71 0H18v5.14h-1.72zM6 0L1.71 4.29v15.42h5.14V24l4.29-4.29h3.43L22.29 12V0zm14.57 11.14l-3.43 3.43h-3.43l-3 3v-3H6.86V1.71h13.71z' },
];

export default function NavbarJJettas() {
  const [open, setOpen] = useState(false);
  const [isComp, setIsComp] = useState(false);
  const [lightScene, setLightScene] = useState(false);
  const [active, setActive] = useState('#amy');
  const root = useRef(null);
  const trigger = useRef(null);
  const destination = useRef(null);

  useEffect(() => {
    document.body.classList.toggle('comp-mode', isComp);
    return () => document.body.classList.remove('comp-mode');
  }, [isComp]);

  useEffect(() => {
    let frame = 0;
    const hero = document.getElementById('amy');
    const stage = hero?.querySelector('.amy-stage');
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLightScene(Boolean(hero && stage && hero.getBoundingClientRect().bottom > 82 &&
          stage.dataset.phase === 'settled' && stage.dataset.zoomed !== 'true' &&
          hero.dataset.portraitError !== 'true'));
      });
    };
    const observer = new MutationObserver(update);
    if (stage) observer.observe(stage, { attributes: true, attributeFilter: ['data-phase', 'data-zoomed'] });
    if (hero) observer.observe(hero, { attributes: true, attributeFilter: ['data-portrait-error'] });
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('amy-hero-phase', update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('amy-hero-phase', update);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const navbar = root.current;
    const background = [...navbar.parentElement.children].filter((el) => el !== navbar);
    const inertStates = background.map((el) => el.inert);
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    background.forEach((el) => { el.inert = true; });
    document.documentElement.style.overflow = 'hidden';
    // Clip the body without creating a scroll container that would unpin the sticky Hero.
    document.body.style.overflow = 'clip';
    trigger.current.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = [...navbar.querySelectorAll('a[href], button')];
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      background.forEach((el, i) => { el.inert = inertStates[i]; });
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      const target = destination.current;
      destination.current = null;
      if (target) {
        const tabIndex = target.getAttribute('tabindex');
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => {
          if (tabIndex === null) target.removeAttribute('tabindex');
          else target.setAttribute('tabindex', tabIndex);
        }, { once: true });
        target.focus({ preventScroll: true });
      } else {
        trigger.current?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const toggleMenu = () => {
    if (!open) {
      const sections = LINK_ROWS.flat().filter((link) => !link.external)
        .map((link) => ({ href: link.href, top: document.querySelector(link.href)?.getBoundingClientRect().top }))
        .filter((section) => section.top <= 160).sort((a, b) => b.top - a.top);
      setActive(sections[0]?.href || '#amy');
    }
    setOpen((value) => !value);
  };

  const navigate = (event) => {
    // Native fragment navigation also informs the Hero's anchor/hold handler.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const hash = event.currentTarget.getAttribute('href');
    if (hash.startsWith('#')) {
      if (open) destination.current = document.querySelector(hash);
      setActive(hash);
    }
    setOpen(false);
  };

  return (
    <div ref={root} className={`jj-navbar${open ? ' menu-is-open' : ''}${lightScene ? ' jj-navbar--light-scene' : ''}`}
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}
      aria-label={open ? 'Menú principal' : undefined}
      onWheel={open ? (event) => event.stopPropagation() : undefined}
      onTouchStart={open ? (event) => event.stopPropagation() : undefined}
      onTouchMove={open ? (event) => event.stopPropagation() : undefined}>
      <header className="jj-header">
        <a href="#amy" className="jj-brand-left" aria-label="AMY Inicio" onClick={navigate}>
          <svg width="30" height="30" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <path d="M18 3L6 29L12.5 26L18 14.5L23.5 26L30 29L18 3Z" fill="currentColor" />
            <path d="M18 18.5L13.5 28L18 25.5L22.5 28L18 18.5Z" fill="#df303c" />
            <path d="M4 14L11 17.5L9.5 21L4 14ZM32 14L25 17.5L26.5 21L32 14Z" fill="currentColor" opacity="0.75" />
          </svg>
        </a>
        <div className="jj-center-title">AMY J. GIL</div>
        <button ref={trigger} type="button" className="jj-menu-btn" aria-expanded={open}
          aria-controls="jj-overlay" aria-label={open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} onClick={toggleMenu}>
          <span className="jj-lines-wrap" aria-hidden="true">
            <span className="jj-line jj-line-top" /><span className="jj-line jj-line-bot" />
          </span>
        </button>
      </header>

      <div id="jj-overlay" className="jj-overlay" aria-hidden={!open} inert={!open}>
        <div className="jj-overlay-grain" aria-hidden="true" />
        <div className="jj-hud-corners" aria-hidden="true">
          {['tl', 'tr', 'bl', 'br'].map((corner) => <span key={corner} className={`jj-hud-cross jj-hud-cross--${corner}`}>+</span>)}
        </div>
        <div aria-hidden="true" />
        <div className="jj-center-stage">
          <nav className="jj-nav-rows" aria-label="Secciones de AMY">
            {LINK_ROWS.map((row, rowIndex) => (
              <div className="jj-nav-row" key={rowIndex}>
                {row.map((link, index) => (
                  <a key={link.href} href={link.href} className={`jj-nav-link${active === link.href ? ' is-active' : ''}`}
                    style={{ '--idx': rowIndex * 4 + index + 1 }} aria-current={active === link.href ? 'location' : undefined}
                    target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined} onClick={navigate}>
                    <span className="jj-link-bracket left" aria-hidden="true">[</span>
                    <span>{link.label}</span>
                    <span className="jj-link-bracket right" aria-hidden="true">]</span>
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="jj-socials" aria-label="Redes de AMY">
            {SOCIALS.map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" className="jj-social-link" onClick={navigate}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={social.path} /></svg>
                <span className="jj-social-handle">{social.label}</span>
              </a>
            ))}
          </div>
        </div>
        <footer className="jj-overlay-footer">
          <div>© 2026 AMYJGIL <span className="jj-footer-sep">·</span> <span className="jj-footer-description">VALORANT CREATOR ECOSYSTEM</span></div>
          <div className="jj-footer-status">STATUS // AGENT READY: SAGE LOCK-IN</div>
          <div className="jj-footer-protocol">
            <span>PROTOCOL: 128HZ · PLATINO 3</span>
            <button type="button" className="jj-mode-btn" aria-pressed={isComp}
              aria-label={isComp ? 'Volver a modo normal' : 'Modo competitivo: textos en rojo'}
              title={isComp ? 'Modo normal' : 'Modo competitivo'} onClick={() => setIsComp((value) => !value)}>
              <span aria-hidden="true">{isComp ? '❤️' : '🖤'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
