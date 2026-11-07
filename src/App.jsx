import NavbarJJettas from '@/components/layout/NavbarJJettas.jsx';
import Hero from '@/components/scenes/Hero.jsx';
import AgentCarousel from '@/components/scenes/AgentCarousel.jsx';
import NebulosaChapter from '@/components/scenes/nebulosa/NebulosaChapter.jsx';
import { useNarrativeScroll } from '@/hooks/useNarrativeScroll.js';
import { useScrollProgress } from '@/hooks/useScrollProgress.js';

export default function App() {
  useScrollProgress();
  useNarrativeScroll();

  return (
    <>
      <div id="scrollBar"></div>

      <NavbarJJettas />

      <main id="main" aria-label="Contenido principal">
        <Hero />
        <div className="nebulosa-flow-exit"><AgentCarousel /></div>
        <NebulosaChapter />
      </main>

    </>
  );
}
