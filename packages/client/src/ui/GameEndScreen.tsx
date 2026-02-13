import { useGameStore } from '../stores/game-store.js';
import * as s from './styles.js';

const REASON_TEXT: Record<string, string> = {
  all_crew_dead: 'All crew members were eliminated!',
  all_tasks_done: 'All tasks were completed!',
  shadow_eliminated: 'All shadows were eliminated!',
  all_left: 'All players left the match.',
};

export function GameEndScreen() {
  const phase = useGameStore((st) => st.phase);
  const result = useGameStore((st) => st.gameEndResult);

  if (phase !== 'results' || !result) return null;

  const isShadowWin = result.winner === 'shadow';
  const mainColor = isShadowWin ? s.colors.danger : s.colors.success;
  const winnerText = isShadowWin ? 'SHADOWS WIN' : 'CREW WINS';
  const reasonText = REASON_TEXT[result.reason] ?? result.reason;

  const minutes = Math.floor(result.stats.gameDurationSec / 60);
  const seconds = result.stats.gameDurationSec % 60;

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
        animation: 'endFadeIn 0.6s ease-out',
      }}
    >
      <style>{`
        @keyframes endFadeIn {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes endGlow {
          0%, 100% { text-shadow: 0 0 20px currentColor; }
          50% { text-shadow: 0 0 50px currentColor, 0 0 100px currentColor; }
        }
      `}</style>

      {/* Background overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isShadowWin
            ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(40,0,0,0.9) 100%)'
            : 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,30,10,0.9) 100%)',
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 1, maxWidth: 500 }}>
        {/* Winner text */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: mainColor,
            letterSpacing: 4,
            marginBottom: 12,
            animation: 'endGlow 2s ease-in-out infinite',
          }}
        >
          {winnerText}
        </div>

        {/* Reason */}
        <div
          style={{
            fontSize: 18,
            color: 'rgba(255, 255, 255, 0.7)',
            marginBottom: 32,
          }}
        >
          {reasonText}
        </div>

        {/* Role reveal */}
        <div
          style={{
            background: 'rgba(10, 10, 18, 0.8)',
            border: `1px solid ${s.colors.border}`,
            borderRadius: 12,
            padding: '16px 24px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: s.colors.textMuted,
              marginBottom: 12,
              letterSpacing: 1,
            }}
          >
            ROLE REVEAL
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(result.roles).map(([playerId, info]) => (
              <div
                key={playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 15,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: info.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: s.colors.text, flex: 1, textAlign: 'left' }}>
                  {info.name}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: info.role === 'shadow' ? s.colors.danger : s.colors.success,
                    fontSize: 13,
                    letterSpacing: 1,
                  }}
                >
                  {info.role === 'shadow' ? 'SHADOW' : 'CREW'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            fontSize: 14,
            color: s.colors.textMuted,
            marginBottom: 24,
          }}
        >
          Tasks: {result.stats.tasksCompleted}/{result.stats.totalTasks} | Duration: {minutes}m {seconds}s
        </div>

        {/* Auto-return message */}
        <div
          style={{
            fontSize: 14,
            color: 'rgba(255, 255, 255, 0.4)',
            fontStyle: 'italic',
          }}
        >
          Returning to lobby in 5 seconds...
        </div>
      </div>
    </div>
  );
}
