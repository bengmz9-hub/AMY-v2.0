import NavbarJJettas from '@/components/layout/NavbarJJettas.jsx';
import Footer from '@/components/layout/Footer.jsx';
import Hero from '@/components/scenes/Hero.jsx';
import AgentCarousel from '@/components/scenes/AgentCarousel.jsx';
import Stats from '@/components/sections/Stats.jsx';
import SetupGear from '@/components/sections/SetupGear.jsx';
import AmyShow from '@/components/sections/AmyShow.jsx';
import { useScrollProgress } from '@/hooks/useScrollProgress.js';
import { useIntersectionFade } from '@/hooks/useIntersectionFade.js';

export default function App() {
  useScrollProgress();
  useIntersectionFade();

  return (
    <>
      <div id="scrollBar"></div>

      <NavbarJJettas />

      <main id="main" aria-label="Contenido principal">
        <Hero />
        <AgentCarousel />
        <Stats />
        <SetupGear />
        <AmyShow />
      </main>

      <Footer />
    </>
  );
}
