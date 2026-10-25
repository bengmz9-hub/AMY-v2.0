import { useAimTrainer } from '../../hooks/useAimTrainer';

export default function AimTrainer() {
  const {
    canvasRef,
    isPlaying,
    hits,
    accuracy,
    timeLeft,
    startGame,
    endGame,
    shoot,
    handlePointerMove
  } = useAimTrainer();

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
