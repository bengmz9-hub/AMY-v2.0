// WordReveal — títulos estilo Folira/Create®: texto que se revela en cascada al entrar en viewport.
// parts: [{ t: 'texto', hl: false }] — hl marca el segmento con la clase .highlight existente del repo.
// mode: 'words' (default, Folira) | 'letters' (Create®, letra a letra, más cinematográfico).
// Respeta prefers-reduced-motion (todo visible al instante). CSS: bloque wr-* en index.css.
import { useEffect, useRef } from 'react';

export default function WordReveal({ as: Tag = 'h2', className = '', parts, mode = 'words' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('wr-visible');
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => el.classList.toggle('wr-visible', e.isIntersecting));
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  let wi = 0;
  const unit = mode === 'letters' ? 22 : 45; // ms por letra / por palabra
  const safeParts = Array.isArray(parts) ? parts : [];

  return (
    <Tag ref={ref} className={'wr ' + (className || '')}>
      {safeParts.map((p, pi) => {
        const text = typeof p?.t === 'string' ? p.t : '';
        return (
          <span className="wr-seg" key={pi}>
            {mode === 'letters'
              ? text.split('').map((ch, ci) => {
                  const delay = wi * unit;
                  wi += 1;
                  return (
                    <span
                      key={ci}
                      className={'wr-letter' + (p?.hl ? ' highlight' : '')}
                      style={{ transitionDelay: delay + 'ms' }}
                    >
                      {ch === ' ' ? '\u00A0' : ch}
                    </span>
                  );
                })
              : text.split(' ').map((w, wIdx) => {
                  const delay = wi * unit;
                  wi += 1;
                  return (
                    <span
                      key={`${w}-${wIdx}-${wi}`}
                      className={'wr-word' + (p?.hl ? ' highlight' : '')}
                      style={{ transitionDelay: delay + 'ms' }}
                    >
                      {w}
                      {'\u00A0'}
                    </span>
                  );
                })}
          </span>
        );
      })}
    </Tag>
  );
}
