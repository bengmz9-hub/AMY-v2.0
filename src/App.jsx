import NavbarAceternity from '@/components/layout/NavbarAceternity.jsx';
import Footer from '@/components/layout/Footer.jsx';
import Hero from '@/components/sections/Hero.jsx';
import Stats from '@/components/sections/Stats.jsx';
import Agents from '@/components/sections/Agents.jsx';
import SetupGear from '@/components/sections/SetupGear.jsx';
import AmyShow from '@/components/sections/AmyShow.jsx';
import { useScrollProgress } from '@/hooks/useScrollProgress.js';
import { useIntersectionFade } from '@/hooks/useIntersectionFade.js';
import Preloader from '@/components/layout/Preloader.jsx';
import { useState, useEffect } from 'react';

export default function App() {
  const [heroReady, setHeroReady] = useState(false);

  useEffect(() => {
    const handleHeroReady = () => setHeroReady(true);
    window.addEventListener('amy-hero-ready', handleHeroReady);
    return () => window.removeEventListener('amy-hero-ready', handleHeroReady);
  }, []);
  useScrollProgress();
  useIntersectionFade();

  return (
    <>
      <Preloader isReady={heroReady} />
      <div id="scrollBar"></div>

      <NavbarAceternity />

      <main id="main" aria-label="Contenido principal">
        <Hero />
        <Stats />
        <Agents />
        <SetupGear />
        <AmyShow />
      </main>

      <Footer />
    </>
  );
}
