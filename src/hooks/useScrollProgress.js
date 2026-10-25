import { useEffect } from 'react';

export function useScrollProgress() {
  useEffect(() => {
    const scrollBar = document.getElementById('scrollBar');
    if (!scrollBar) return;

    let ticking = false;
    const { documentElement, body } = document;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const winScroll = documentElement.scrollTop || body.scrollTop;
          const height = documentElement.scrollHeight - documentElement.clientHeight;
          const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
          scrollBar.style.width = scrolled + '%';
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
}
