import { useEffect } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { playPowerActivate } from '../audio/sound-manager.js';
import * as s from './styles.js';

export function TargetSelector() {
  const targetingMode = useGameStore((st) => st.targetingMode);
  const nearbyTargets = useGameStore((st) => st.nearbyTargets);
  const exitTargetingMode = useGameStore((st) => st.exitTargetingMode);
  const socket = useNetworkStore((st) => st.socket);

  // Cancel on Q or Escape key
  useEffect(() => {
    if (!targetingMode) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'KeyQ' || e.code === 'Escape') {
        e.preventDefault();
        exitTargetingMode();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [targetingMode, exitTargetingMode]);

  if (!targetingMode || nearbyTargets.length === 0) return null;

  function handleSelect(targetId: string) {
    if (!socket) return;
    playPowerActivate();
    socket.emit('power:activate', { targetId });
    exitTargetingMode();
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        cursor: 'default',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) exitTargetingMode();
      }}
    >
      <div
        style={{
          background: s.colors.surface,
          border: `1px solid ${s.colors.border}`,
          borderRadius: 12,
          padding: '24px 28px',
          minWidth: 280,
          maxWidth: '90vw',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: s.colors.warning,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          SELECT TARGET
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nearbyTargets.map((target) => (
            <button
              key={target.id}
              onClick={() => handleSelect(target.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                background: s.colors.bg,
                border: `1px solid ${s.colors.border}`,
                borderRadius: 8,
                color: s.colors.text,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = s.colors.primary;
                e.currentTarget.style.background = s.colors.surfaceHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = s.colors.border;
                e.currentTarget.style.background = s.colors.bg;
              }}
            >
              {/* Color swatch */}
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: target.color,
                  flexShrink: 0,
                  border: '2px solid rgba(255,255,255,0.2)',
                }}
              />
              {/* Name */}
              <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>
                {target.name}
              </span>
              {/* Distance */}
              <span style={{ fontSize: 12, color: s.colors.textMuted }}>
                {target.distance}m
              </span>
            </button>
          ))}
        </div>

        <div
          style={{
            fontSize: 11,
            color: s.colors.textMuted,
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          Press [Q] or [Esc] to cancel
        </div>
      </div>
    </div>
  );
}
