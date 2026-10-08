import { useEffect, useRef, useState } from 'react';

export default function AimTrainer() {
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hits, setHits] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);

  // Referencias mutables para el bucle de animación a 60fps
  const gameState = useRef({
    isPlaying: false,
    hits: 0,
    totalClicks: 0,
    timeLeft: 10,
    posX: 400,
    posY: 200,
    targetX: 400,
    targetY: 200,
    targetRadius: 14,
    particles: [],
    floatingTexts: [],
    animFrameId: null,
    gameInterval: null,
  });

  const getAccent = () => {
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim() || '#ff4655'
    );
  };

  const spawnTarget = (width, height) => {
    const margin = 30;
    gameState.current.targetX = margin + Math.random() * (width - margin * 2);
    gameState.current.targetY = margin + Math.random() * (height - margin * 2);
  };

  const createExplosion = (x, y, color) => {
    for (let i = 0; i < 12; i++) {
      gameState.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2.5,
        vy: (Math.random() - 0.5) * 2.5,
        radius: Math.random() * 2.5 + 1.5,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.008,
        color,
      });
    }
  };

  const spawnFloatingText = (x, y, text, color) => {
    gameState.current.floatingTexts.push({
      x,
      y,
      vy: -0.6,
      alpha: 1,
      text,
      color,
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const accent = getAccent();
    const st = gameState.current;

    if (st.isPlaying) {
      // Brillo exterior
      ctx.fillStyle = accent + '33';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(st.targetX, st.targetY, st.targetRadius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Centro
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(st.targetX, st.targetY, st.targetRadius - 4, 0, Math.PI * 2);
      ctx.fill();

      // Punto blanco central
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(st.targetX, st.targetY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Partículas
    for (let i = st.particles.length - 1; i >= 0; i--) {
      const p = st.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        st.particles.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Textos flotantes
    for (let i = st.floatingTexts.length - 1; i >= 0; i--) {
      const ft = st.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.02;
      if (ft.alpha <= 0) {
        st.floatingTexts.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 12px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    // Hitmarkers tácticos (Valorant hit-feedback)
    if (st.hitmarkers) {
      for (let i = st.hitmarkers.length - 1; i >= 0; i--) {
        const hm = st.hitmarkers[i];
        hm.alpha -= 0.08;
        if (hm.alpha <= 0) {
          st.hitmarkers.splice(i, 1);
        } else {
          ctx.save();
          ctx.globalAlpha = hm.alpha;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          const hs = 6;
          ctx.beginPath();
          ctx.moveTo(hm.x - hs, hm.y - hs);
          ctx.lineTo(hm.x + hs, hm.y + hs);
          ctx.moveTo(hm.x + hs, hm.y - hs);
          ctx.lineTo(hm.x - hs, hm.y + hs);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Retícula / Mira del usuario
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    const s = 10;
    const g = 4;

    ctx.beginPath();
    ctx.moveTo(st.posX - s, st.posY);
    ctx.lineTo(st.posX - g, st.posY);
    ctx.moveTo(st.posX + g, st.posY);
    ctx.lineTo(st.posX + s, st.posY);
    ctx.moveTo(st.posX, st.posY - s);
    ctx.lineTo(st.posX, st.posY - g);
    ctx.moveTo(st.posX, st.posY + g);
    ctx.lineTo(st.posX, st.posY + s);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(st.posX, st.posY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const gameLoop = () => {
    const st = gameState.current;
    if (st.isPlaying || st.particles.length > 0 || st.floatingTexts.length > 0 || (st.hitmarkers && st.hitmarkers.length > 0)) {
      draw();
      st.animFrameId = requestAnimationFrame(gameLoop);
    } else {
      draw();
      st.animFrameId = null;
    }
  };

  const triggerAnimation = () => {
    if (!gameState.current.animFrameId) {
      gameState.current.animFrameId = requestAnimationFrame(gameLoop);
    }
  };

  const startGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = gameState.current;
    st.isPlaying = true;
    st.timeLeft = 15;
    st.hits = 0;
    st.totalClicks = 0;
    st.particles = [];
    st.floatingTexts = [];
    st.hitmarkers = [];

    setTimeLeft(15);
    setHits(0);
    setTotalClicks(0);
    setIsPlaying(true);

    spawnTarget(canvas.width, canvas.height);
    triggerAnimation();

    if (st.gameInterval) clearInterval(st.gameInterval);
    st.gameInterval = setInterval(() => {
      st.timeLeft -= 1;
      setTimeLeft(st.timeLeft);
      if (st.timeLeft <= 0) {
        endGame();
      }
    }, 1000);
  };

  const endGame = () => {
    gameState.current.isPlaying = false;
    if (gameState.current.gameInterval) {
      clearInterval(gameState.current.gameInterval);
      gameState.current.gameInterval = null;
    }
    setIsPlaying(false);
    triggerAnimation();
  };

  const shoot = () => {
    const st = gameState.current;
    if (!st.isPlaying) return;

    st.totalClicks += 1;
    setTotalClicks(st.totalClicks);

    const dist = Math.hypot(st.posX - st.targetX, st.posY - st.targetY);
    const canvas = canvasRef.current;
    const accentColor = getAccent();

    if (dist <= st.targetRadius + 8) {
      st.hits += 1;
      setHits(st.hits);
      if (!st.hitmarkers) st.hitmarkers = [];
      st.hitmarkers.push({ x: st.posX, y: st.posY, alpha: 1 });
      createExplosion(st.targetX, st.targetY, accentColor);
      spawnFloatingText(st.targetX, st.targetY - 20, '+1', '#ffffff');
      if (canvas) spawnTarget(canvas.width, canvas.height);
    } else {
      spawnFloatingText(st.posX, st.posY - 20, 'MISS', '#ff4655');
    }

    triggerAnimation();
  };

  const handlePointerMove = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    gameState.current.posX = (clientX - rect.left) * scaleX;
    gameState.current.posY = (clientY - rect.top) * scaleY;
    triggerAnimation();
  };

  useEffect(() => {
    draw();
    return () => {
      if (gameState.current.gameInterval) clearInterval(gameState.current.gameInterval);
      if (gameState.current.animFrameId) cancelAnimationFrame(gameState.current.animFrameId);
    };
  }, []);

  const accuracy = totalClicks > 0 ? Math.round((hits / totalClicks) * 100) : 100;

  return (
    <div className="simulator-box">
      <h3>🎯 Desafío de Puntería</h3>
      <p style={{ marginBottom: '0.8rem', color: 'var(--text-sub)' }}>
        Mueve el ratón dentro del recuadro para apuntar y haz clic para disparar.
      </p>

      <div className="aim-stats" style={{ visibility: isPlaying ? 'visible' : 'hidden' }}>
        <div>DIANAS: <span>{hits}</span></div>
        <div>PRECISIÓN: <span>{accuracy}%</span></div>
        <div>TIEMPO: <span>{timeLeft}s</span></div>
      </div>

      <canvas
        ref={canvasRef}
        id="sensCanvas"
        className="sim-canvas"
        width="800"
        height="400"
        style={{ width: '100%', maxWidth: '800px', height: 'auto', cursor: 'crosshair', touchAction: 'none' }}
        onPointerMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onPointerDown={(e) => {
          handlePointerMove(e.clientX, e.clientY);
          shoot();
        }}
      />

      <div className="simulator-controls">
        <button
          className="filter-btn active"
          onClick={isPlaying ? endGame : startGame}
          style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem', borderRadius: '100px', cursor: 'pointer' }}
        >
          {isPlaying ? 'Detener Juego ⏹️' : 'Iniciar Juego 🎯'}
        </button>
      </div>
    </div>
  );
}
