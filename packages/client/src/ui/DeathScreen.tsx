import { useGameStore } from '../stores/game-store.js';
import * as s from './styles.js';

const CAUSE_INFO: Record<string, { label: string; color: string }> = {
  heat: { label: 'CALOR EXTREMO', color: '#ff8844' },
  cold: { label: 'FRIO INTENSO', color: '#44aaff' },
  fire: { label: 'QUEIMADURA', color: '#ff4444' },
  oxygen: { label: 'FALTA DE OXIGENIO', color: '#aa44ff' },
  'heat+fire': { label: 'CALOR + INCENDIO', color: '#ff6644' },
  'cold+oxygen': { label: 'FRIO + SEM OXIGENIO', color: '#6688ff' },
  'heat+oxygen': { label: 'CALOR + SEM OXIGENIO', color: '#ff8866' },
};

function getCauseInfo(cause: string | null): { label: string; color: string } {
  if (!cause || cause === 'none') return { label: 'CAUSA DESCONHECIDA', color: s.colors.danger };
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

export function DeathScreen() {
  const showDeathScreen = useGameStore((st) => st.showDeathScreen);
  const deathCause = useGameStore((st) => st.deathCause);
  const dismissDeathScreen = useGameStore((st) => st.dismissDeathScreen);

  if (!showDeathScreen) return null;

  const causeInfo = getCauseInfo(deathCause);

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
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 1 }}>
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
          VOCE MORREU
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
            marginBottom: 40,
          }}
        >
          Sua jornada na estacao acabou... mas voce pode continuar como fantasma.
        </div>

        {/* Continue as ghost button */}
        <button
          onClick={dismissDeathScreen}
          style={{
            padding: '14px 40px',
            background: 'rgba(68, 136, 255, 0.2)',
            border: '2px solid #4488ff',
            borderRadius: 12,
            color: '#4488ff',
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 1,
            transition: 'all 0.2s ease',
            pointerEvents: 'auto',
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
          CONTINUAR COMO FANTASMA
        </button>

        <div
          style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.3)',
            marginTop: 12,
          }}
        >
          Mova-se livremente, possua corpos, desligue luzes e complete tarefas
        </div>
      </div>
    </div>
  );
}
