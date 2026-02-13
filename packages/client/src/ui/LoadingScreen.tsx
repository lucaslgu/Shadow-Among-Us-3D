import { useGameStore } from '../stores/game-store.js';
import * as s from './styles.js';

export function LoadingScreen() {
  const playerInfo = useGameStore((st) => st.playerInfo);
  const loadedPlayerIds = useGameStore((st) => st.loadedPlayerIds);
  const loadingTotalPlayers = useGameStore((st) => st.loadingTotalPlayers);
  const cosmicScenario = useGameStore((st) => st.cosmicScenario);

  const totalPlayers = loadingTotalPlayers || Object.keys(playerInfo).length;
  const loadedCount = loadedPlayerIds.length;
  const pct = totalPlayers > 0 ? Math.round((loadedCount / totalPlayers) * 100) : 0;

  // Build player list with loaded status
  const playerEntries = Object.entries(playerInfo).map(([id, info]) => ({
    id,
    name: info.name,
    color: info.color,
    loaded: loadedPlayerIds.includes(id),
  }));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 5, 12, 0.95)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: s.colors.text,
        zIndex: 50,
      }}
    >
      <style>{`
        @keyframes loadingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes loadingDots {
          0% { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75% { content: '...'; }
        }
      `}</style>

      {/* Title */}
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
        Shadow Among Us
      </div>

      {/* Cosmic scenario theme */}
      {cosmicScenario && (
        <div style={{ fontSize: 14, color: s.colors.primary, marginBottom: 24, fontStyle: 'italic' }}>
          {cosmicScenario.theme}
        </div>
      )}

      {/* Loading spinner */}
      <div
        style={{
          width: 48,
          height: 48,
          border: `3px solid ${s.colors.border}`,
          borderTopColor: s.colors.primary,
          borderRadius: '50%',
          animation: 'loadingSpin 1s linear infinite',
          marginBottom: 24,
        }}
      />

      {/* Status text */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: s.colors.text,
          marginBottom: 16,
          animation: 'loadingPulse 2s ease-in-out infinite',
        }}
      >
        Loading 3D environment...
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 320,
          maxWidth: '80vw',
          height: 8,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct === 100 ? s.colors.success : s.colors.primary,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Player progress */}
      <div
        style={{
          fontSize: 13,
          color: s.colors.textMuted,
          marginBottom: 12,
        }}
      >
        Players ready: {loadedCount}/{totalPlayers}
      </div>

      {/* Player list */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: 280,
          maxWidth: '80vw',
        }}
      >
        {playerEntries.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px',
              background: p.loaded ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              borderRadius: 6,
              border: `1px solid ${p.loaded ? 'rgba(74, 222, 128, 0.2)' : s.colors.border}`,
              transition: 'all 0.3s ease',
            }}
          >
            {/* Color dot */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: p.color,
                flexShrink: 0,
              }}
            />

            {/* Name */}
            <div
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 500,
                color: p.loaded ? s.colors.success : s.colors.textMuted,
              }}
            >
              {p.name}
            </div>

            {/* Status icon */}
            <div style={{ fontSize: 14, flexShrink: 0 }}>
              {p.loaded ? '\u2705' : (
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: `2px solid ${s.colors.textMuted}`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'loadingSpin 1s linear infinite',
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tip text */}
      <div
        style={{
          marginTop: 32,
          fontSize: 11,
          color: s.colors.textMuted,
          textAlign: 'center',
          maxWidth: 300,
        }}
      >
        The game starts when all players finish loading
      </div>
    </div>
  );
}
