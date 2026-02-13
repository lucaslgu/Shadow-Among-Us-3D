import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

export function GameOverScreen() {
  const gameEndResult = useGameStore((s) => s.gameEndResult);
  const localRole = useGameStore((s) => s.localRole);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'results' || !gameEndResult) return null;

  const isWinner =
    (localRole === 'crew' && gameEndResult.winner === 'crew') ||
    (localRole === 'shadow' && gameEndResult.winner === 'shadow');

  const winnerLabel = gameEndResult.winner === 'crew' ? 'CREW WINS' : 'IMPOSTORS WIN';
  const personalLabel = isWinner ? 'VICTORY!' : 'DEFEAT';
  const personalColor = isWinner ? '#4ade80' : '#ef4444';

  function handleReturn() {
    const roomCode = useNetworkStore.getState().currentRoomCode;
    useGameStore.getState().reset();
    if (roomCode) {
      window.location.hash = `/lobby/${roomCode}`;
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
      <div style={{ fontSize: 42, fontWeight: 900, color: personalColor, letterSpacing: 3, marginBottom: 8 }}>
        {personalLabel}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#aabbdd', marginBottom: 6 }}>
        {winnerLabel}
      </div>
      <div style={{ fontSize: 14, color: '#8bb4ff', marginBottom: 24 }}>
        {gameEndResult.reason}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24, fontSize: 13, color: '#888' }}>
        <span>Tasks: {gameEndResult.stats.tasksCompleted}/{gameEndResult.stats.totalTasks}</span>
        <span>Duration: {Math.floor(gameEndResult.stats.gameDurationSec / 60)}m {gameEndResult.stats.gameDurationSec % 60}s</span>
      </div>

      {/* Roles reveal */}
      <div style={{ marginBottom: 24, width: '100%', maxWidth: 500 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#6b6b8a', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Role Reveal
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, padding: '0 16px' }}>
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
