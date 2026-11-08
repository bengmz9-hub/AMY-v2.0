import { useCallback, useEffect, useRef, useState } from 'react';
import NavbarJJettas from '@/components/layout/NavbarJJettas.jsx';
import Hero from '@/components/scenes/Hero.jsx';
import AgentCarousel from '@/components/scenes/AgentCarousel.jsx';
import NebulosaChapter from '@/components/scenes/nebulosa/NebulosaChapter.jsx';
import { useScrollProgress } from '@/hooks/useScrollProgress.js';
import { useWheelPulse } from '@/hooks/useWheelPulse.js';
import { useScreenSteps } from '@/hooks/useScreenSteps.js';
import StartupCover, { shouldPrepareStartup } from '@/components/ui/StartupCover.jsx';

export default function App() {
  const [startup, setStartup] = useState(() => ({
    active: shouldPrepareStartup(), reason: null,
  }));
  const [startupTasks, setStartupTasks] = useState({
    portrait: 'pending', plate: 'pending', video: 'pending', layout: 'pending', heroAssets: 'pending',
    arsenal: 'pending', nebula: 'pending', recomposition: 'pending',
  });
  const reportStartup = useCallback((task, value) => setStartupTasks(current =>
    current[task] === value ? current : { ...current, [task]: value }), []);
  const reportHero = useCallback(values => setStartupTasks(current => ({ ...current, ...values })), []);
  const reportFonts = useCallback(value => reportStartup('fonts', value), [reportStartup]);
  const restoreStartupFocus = useRef(false);
  const finishStartup = useCallback((reason) => {
    restoreStartupFocus.current = Boolean(document.activeElement?.closest('.startup-cover'));
    setStartup({ active: false, reason });
  }, []);
  useEffect(() => {
    if (!startup.active && restoreStartupFocus.current) {
      restoreStartupFocus.current = false;
      if (document.activeElement === document.body) {
        document.querySelector('.jj-brand-left')?.focus({ preventScroll: true });
      }
    }
  }, [startup.active]);
  useScrollProgress();
  const screenSteps = new URLSearchParams(location.search).get('scroll') !== 'continuous';
  useWheelPulse(!screenSteps);
  useScreenSteps(screenSteps);

  return (
    <>
      <div id="scrollBar"></div>

      <NavbarJJettas startupCoverActive={startup.active} />

      <main id="main" aria-label="Contenido principal" inert={startup.active}
        aria-busy={startup.active || undefined} data-startup={startup.active ? 'loading' : startup.reason || 'bypassed'}>
        <Hero startupCoverActive={startup.active} onStartupProgress={reportHero} />
        <div className="nebulosa-flow-exit"><AgentCarousel startupCoverActive={startup.active} prepareStartup={Boolean(startup.active && startupTasks.fonts && startupTasks.fonts !== 'pending')} onStartupProgress={reportStartup} /></div>
        <NebulosaChapter startupCoverActive={startup.active} startupFontsReady={Boolean(startupTasks.fonts && startupTasks.fonts !== 'pending')} onStartupProgress={reportStartup} />
      </main>
      {startup.active && <StartupCover tasks={startupTasks} onFinish={finishStartup} onFontsPrepared={reportFonts} />}

    </>
  );
}
