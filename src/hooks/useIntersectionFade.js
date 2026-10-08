import { useEffect } from 'react';

export function useIntersectionFade() {
  useEffect(() => {
    const fadeElements = document.querySelectorAll('.fade-in-section');
    if (!fadeElements.length) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );
      fadeElements.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    } else {
      fadeElements.forEach((el) => el.classList.add('is-visible'));
    }
  }, []);
}
