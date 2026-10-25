import { useEffect, useState } from 'react';
import './Preloader.css';

export default function Preloader({ isReady }) {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!shouldRender) return null;

  return (
    <div className={`wipe-reveal-curtain ${isReady ? 'wipe-out' : ''}`} aria-hidden="true">
      <div className="wipe-reveal-logo">
        AMY
      </div>
    </div>
  );
}
