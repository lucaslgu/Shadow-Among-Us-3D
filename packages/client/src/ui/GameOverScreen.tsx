import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

export function GameOverScreen() {
  const navigate = useNavigate();
  const gameEndResult = useGameStore((s) => s.gameEndResult);
  const localRole = useGameStore((s) => s.localRole);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'results' || !gameEndResult) return null;

  const isDraw = gameEndResult.winner === 'draw';
  const isWinner = !isDraw && (
    (localRole === 'crew' && gameEndResult.winner === 'crew') ||
    (localRole === 'shadow' && gameEndResult.winner === 'shadow')
  );

  const winnerLabel = isDraw ? 'DRAW' : gameEndResult.winner === 'crew' ? 'CREW WINS' : 'IMPOSTORS WIN';
  const personalLabel = isDraw ? 'DRAW' : isWinner ? 'VICTORY!' : 'DEFEAT';
  const personalColor = isDraw ? '#f59e0b' : isWinner ? '#4ade80' : '#ef4444';

  function handleReturn() {
    const roomCode = useNetworkStore.getState().currentRoomCode;
    // Navigate BEFORE reset — delay reset so React Router processes the
    // route change before GameGuard sees phase='lobby' and redirects to '/'
    if (roomCode) {
      navigate(`/lobby/${roomCode}`);
      setTimeout(() => useGameStore.getState().reset(), 50);
    } else {
      useGameStore.getState().reset();
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: '#e2e2f0',
      }}
    >
      <div style={{ fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: personalColor, letterSpacing: 3, marginBottom: 8, textAlign: 'center' }}>
        {personalLabel}
      </div>
      <div style={{ fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 700, color: '#aabbdd', marginBottom: 6 }}>
        {winnerLabel}
      </div>
      <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#8bb4ff', marginBottom: 24, textAlign: 'center', padding: '0 16px' }}>
        {gameEndResult.reason}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 'clamp(12px, 3vw, 24px)', marginBottom: 24, fontSize: 'clamp(11px, 1.8vw, 13px)', color: '#888', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span>Tasks: {gameEndResult.stats.tasksCompleted}/{gameEndResult.stats.totalTasks}</span>
        <span>Duration: {Math.floor(gameEndResult.stats.gameDurationSec / 60)}m {gameEndResult.stats.gameDurationSec % 60}s</span>
      </div>

      {/* Roles reveal */}
      <div style={{ marginBottom: 24, width: '100%', maxWidth: 500, padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 'clamp(12px, 2vw, 15px)', fontWeight: 700, color: '#6b6b8a', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Role Reveal
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, padding: '0 8px' }}>
          {Object.entries(gameEndResult.roles).map(([id, info]) => (
            <div
              key={id}
              style={{
                background: info.role === 'shadow' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${info.role === 'shadow' ? '#ef4444' : '#333'}`,
                borderRadius: 8,
                padding: '8px 6px',
                textAlign: 'center',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: info.color, margin: '0 auto 4px',
                border: '2px solid rgba(255,255,255,0.2)',
              }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{info.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 700, marginTop: 2,
                color: info.role === 'shadow' ? '#ef4444' : '#4ade80',
              }}>
                {info.role === 'shadow' ? 'IMPOSTOR' : 'CREW'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleReturn}
        style={{
          padding: '12px 32px',
          borderRadius: 8,
          background: '#333',
          border: '1px solid #555',
          color: '#e2e2f0',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Return to Lobby
      </button>
    </div>
  );
}
