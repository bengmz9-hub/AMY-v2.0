import WordReveal from '@/components/ui/WordReveal.jsx';

export default function AmyShow() {
  return (
    <section id="shorts" className="shorts-section fade-in-section">
      <div className="section-title">
        <WordReveal as="h2" parts={[{ t: 'The' }, { t: 'Amy Show', hl: true }]} />
        <p>Jugadas, errores y momentos divertidos.</p>
      </div>
      <div className="tiktok-grid" role="region" aria-label="Clips de AMY">
        <article className="tiktok-wrapper">
          <p className="clip-title">Próximamente</p>
        </article>
      </div>
    </section>
  );
}
