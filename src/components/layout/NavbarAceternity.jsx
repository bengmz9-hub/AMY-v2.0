// NavbarAceternity — píldora flotante (Aceternity-style) adaptada a tokens reales.
// Controla el modo competitivo (🖤/❤️) en desktop y mobile de forma reactiva.
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "#agents", label: "Especialidades" },
  { href: "#gear", label: "Setup" },
  { href: "#shorts", label: "Amy Show" },
];

export default function NavbarAceternity({ isReady }) {
  const [open, setOpen] = useState(false);
  const [isComp, setIsComp] = useState(false);
  const [inHero, setInHero] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    document.body.classList.toggle('comp-mode', isComp);
    return () => document.body.classList.remove('comp-mode');
  }, [isComp]);

  useEffect(() => {
    const updateHeroNav = () => {
      const hero = document.getElementById('amy');
      if (!hero) {
        setInHero(false);
        return;
      }
      const rect = hero.getBoundingClientRect();
      const wipe = parseFloat(hero.dataset.wipe || '0');
      setInHero(rect.bottom > 140 && wipe < 0.55);
    };
    updateHeroNav();
    window.addEventListener('scroll', updateHeroNav, { passive: true });
    window.addEventListener('resize', updateHeroNav);
    window.addEventListener('amy-hero-phase', updateHeroNav);
    return () => {
      window.removeEventListener('scroll', updateHeroNav);
      window.removeEventListener('resize', updateHeroNav);
      window.removeEventListener('amy-hero-phase', updateHeroNav);
    };
  }, []);

  const toggleCompMode = () => {
    setIsComp((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={ref}>
      <nav className={`ac-nav${open ? " ac-open" : ""}${inHero ? " ac-nav--hero" : ""} ${!isReady ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 translate-y-0 transition-all duration-1000 delay-[800ms]"}`} aria-label="Principal">
        <a href="#" className="ac-logo">
          <span className="ac-logo__dot" aria-hidden="true" />
          AMY
        </a>

        <ul className="ac-links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="ac-link">{l.label}</a>
            </li>
          ))}
        </ul>

        <span className="ac-sep" aria-hidden="true" />

        {/* Botón modo competitivo desktop */}
        <button
          className="ac-icon"
          id="modeBtn"
          onClick={toggleCompMode}
          aria-label={isComp ? "Volver a modo normal" : "Modo competitivo: textos en rojo"}
        >
          {isComp ? '❤️' : '🖤'}
        </button>

        <a href="#shorts" className="ac-cta">VER CLIPS</a>

        <button
          className="ac-burger"
          aria-expanded={open}
          aria-controls="ac-panel"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Panel móvil flotante */}
      <div id="ac-panel" className="ac-panel" aria-hidden={!open}>
        {LINKS.map((l, i) => (
          <a
            key={l.href}
            href={l.href}
            className="ac-item"
            style={{ "--i": i }}
            onClick={() => setOpen(false)}
          >
            <span className="ac-item__num">0{i + 1}</span>
            {l.label}
            <span className="ac-item__arrow" aria-hidden="true">›</span>
          </a>
        ))}
        <div className="ac-panel__foot">
          <span className="ac-panel__hint">Platino 3 · Main Sage</span>
          <button
            className="ac-icon"
            onClick={toggleCompMode}
            aria-label={isComp ? "Volver a modo normal" : "Modo competitivo: textos en rojo"}
          >
            {isComp ? '❤️' : '🖤'}
          </button>
        </div>
      </div>
    </div>
  );
}
