import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import * as s from './styles.js';

const CAUSE_INFO: Record<string, { label: string; color: string }> = {
  heat: { label: 'EXTREME HEAT', color: '#ff8844' },
  cold: { label: 'EXTREME COLD', color: '#44aaff' },
  fire: { label: 'BURNED', color: '#ff4444' },
  oxygen: { label: 'OXYGEN DEPLETION', color: '#aa44ff' },
  killed: { label: 'ELIMINATED BY SHADOW', color: '#ef4444' },
  'heat+fire': { label: 'HEAT + FIRE', color: '#ff6644' },
  'cold+oxygen': { label: 'COLD + NO OXYGEN', color: '#6688ff' },
  'heat+oxygen': { label: 'HEAT + NO OXYGEN', color: '#ff8866' },
};

function getCauseInfo(cause: string | null): { label: string; color: string } {
  if (!cause || cause === 'none') return { label: 'UNKNOWN CAUSE', color: s.colors.danger };
  if (CAUSE_INFO[cause]) return CAUSE_INFO[cause];
  // Handle composite causes
  const parts = cause.split('+');
  const labels = parts.map((p) => {
    const info = CAUSE_INFO[p.trim()];
    return info?.label ?? p.trim().toUpperCase();
  });
  const colors = parts.map((p) => CAUSE_INFO[p.trim()]?.color).filter(Boolean);
  return {
    label: labels.join(' + '),
    color: colors[0] ?? s.colors.danger,
  };
}

const btnBase: React.CSSProperties = {
  padding: '12px 32px',
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: 1,
  transition: 'all 0.2s ease',
  pointerEvents: 'auto',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  width: '100%',
  maxWidth: 340,
};

export function DeathScreen() {
  const showDeathScreen = useGameStore((st) => st.showDeathScreen);
  const deathCause = useGameStore((st) => st.deathCause);
  const dismissDeathScreen = useGameStore((st) => st.dismissDeathScreen);
  const socket = useNetworkStore((st) => st.socket);

  if (!showDeathScreen) return null;

  const causeInfo = getCauseInfo(deathCause);

  function handleGhost() {
    socket?.emit('death:choice', { choice: 'ghost' });
    dismissDeathScreen();
  }

  function handleLobby() {
    socket?.emit('death:choice', { choice: 'lobby' });
  }

  function handleLeave() {
    useNetworkStore.getState().leaveRoom();
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        animation: 'deathFadeIn 0.8s ease-out',
      }}
    >
      <style>{`
        @keyframes deathFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes deathPulse {
          0%, 100% { text-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
          50% { text-shadow: 0 0 40px rgba(239, 68, 68, 0.9), 0 0 80px rgba(239, 68, 68, 0.3); }
        }
        @keyframes vignetteBreath {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.9; }
        }
      `}</style>

      {/* Dark overlay with red vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(40,0,0,0.85) 60%, rgba(60,0,0,0.95) 100%)',
          animation: 'vignetteBreath 3s ease-in-out infinite',
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 1, maxWidth: 400 }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: s.colors.danger,
            letterSpacing: 6,
            marginBottom: 16,
            animation: 'deathPulse 2s ease-in-out infinite',
          }}
        >
          YOU DIED
        </div>

        {/* Death cause */}
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: causeInfo.color,
            marginBottom: 8,
            letterSpacing: 2,
          }}
        >
          {causeInfo.label}
        </div>

        <div
          style={{
            fontSize: 14,
            color: 'rgba(255, 255, 255, 0.5)',
            marginBottom: 32,
          }}
        >
          Your journey on the station is over...
        </div>

        {/* Three choice buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* 1. Continue as ghost */}
          <button
            onClick={handleGhost}
            style={{
              ...btnBase,
              background: 'rgba(68, 136, 255, 0.2)',
              border: '2px solid #4488ff',
              color: '#4488ff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(68, 136, 255, 0.35)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(68, 136, 255, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(68, 136, 255, 0.2)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            CONTINUE AS GHOST
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)', marginBottom: 4 }}>
            Move freely, possess bodies, toggle lights and complete tasks
          </div>

          {/* 2. Return to lobby */}
          <button
            onClick={handleLobby}
            style={{
              ...btnBase,
              background: 'rgba(251, 191, 36, 0.15)',
              border: '2px solid #fbbf24',
              color: '#fbbf24',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.3)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(251, 191, 36, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            RETURN TO LOBBY
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)', marginBottom: 4 }}>
            Wait in the room for the next match
          </div>

          {/* 3. Leave room */}
          <button
            onClick={handleLeave}
            style={{
              ...btnBase,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.5)',
              color: 'rgba(239, 68, 68, 0.7)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            LEAVE ROOM
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)' }}>
            Back to main menu
          </div>
        </div>
      </div>
    </div>
  );
}
