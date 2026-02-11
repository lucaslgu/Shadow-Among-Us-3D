import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { POWER_CONFIGS, PowerType } from '@shadow/shared';
import { inputState } from '../networking/mouse-state.js';
import * as s from './styles.js';

function usePowerState() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const localPower = useGameStore((st) => st.localPower);

  if (!localPlayerId || !players[localPlayerId]) {
    return { isActive: false, cooldownEnd: 0, targetId: null, power: localPower };
  }

  const snap = players[localPlayerId];
  return {
    isActive: snap.powerActive,
    cooldownEnd: snap.powerCooldownEnd,
    targetId: snap.mindControlTargetId,
    power: localPower,
  };
}

function PowerStatus({ powerConfig, isActive, cooldownEnd, targetId }: {
  powerConfig: { displayName: string; description: string; type: PowerType };
  isActive: boolean;
  cooldownEnd: number;
  targetId: string | null;
}) {
  const now = Date.now();
  const onCooldown = !isActive && cooldownEnd > now;
  const cooldownRemaining = onCooldown ? Math.ceil((cooldownEnd - now) / 1000) : 0;
  const playerInfo = useGameStore((st) => st.playerInfo);
  const targetName = targetId ? (playerInfo[targetId]?.name ?? '???') : null;

  let statusText: string;
  let statusColor: string;
  if (isActive) {
    statusText = 'ACTIVE - Press [Q] to deactivate';
    statusColor = s.colors.success;
  } else if (onCooldown) {
    statusText = `Cooldown: ${cooldownRemaining}s`;
    statusColor = s.colors.warning;
  } else {
    statusText = 'Press [Q] to activate';
    statusColor = s.colors.primary;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        background: 'rgba(10, 10, 18, 0.85)',
        border: `1px solid ${isActive ? s.colors.success : s.colors.border}`,
        borderRadius: 10,
        padding: '12px 16px',
        pointerEvents: 'auto',
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12, color: s.colors.textMuted, marginBottom: 4 }}>POWER</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: isActive ? s.colors.success : s.colors.text }}>
        {powerConfig.displayName}
      </div>
      <div style={{ fontSize: 11, color: s.colors.textMuted, marginTop: 2 }}>
        {powerConfig.description}
      </div>
      <div style={{ fontSize: 11, color: statusColor, marginTop: 4, fontWeight: 600 }}>
        {statusText}
      </div>
      {isActive && powerConfig.type === PowerType.MIND_CONTROLLER && targetName && (
        <div style={{ fontSize: 11, color: s.colors.warning, marginTop: 4 }}>
          Controlling: {targetName} (Arrow Keys)
        </div>
      )}
    </div>
  );
}

function BatteryIndicator() {
  const [level, setLevel] = useState(1);
  const [depleted, setDepleted] = useState(false);
  const [on, setOn] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setLevel(inputState.batteryLevel);
      setDepleted(inputState.batteryDepleted);
      setOn(inputState.flashlightOn);
    }, 100); // 10 Hz polling
    return () => clearInterval(id);
  }, []);

  const pct = Math.round(level * 100);
  const barColor = pct > 50 ? s.colors.success : pct > 20 ? s.colors.warning : s.colors.danger;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        background: 'rgba(10, 10, 18, 0.85)',
        border: `1px solid ${s.colors.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 140,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontSize: 11, color: s.colors.textMuted, marginBottom: 4 }}>
        FLASHLIGHT {on ? '(ON)' : '(OFF)'} [F]
      </div>
      {/* Bar background */}
      <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 5,
            transition: 'width 0.1s linear',
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: barColor, marginTop: 4, fontWeight: 600, textAlign: 'center' }}>
        {pct}%{depleted ? ' (RECHARGING)' : ''}
      </div>
    </div>
  );
}

export function GameHUD() {
  const role = useGameStore((st) => st.localRole);
  const power = useGameStore((st) => st.localPower);
  const phase = useGameStore((st) => st.phase);
  const { isActive, cooldownEnd, targetId } = usePowerState();

  if (phase !== 'playing') return null;

  const powerConfig = power ? POWER_CONFIGS[power] : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: s.colors.text,
        zIndex: 20,
      }}
    >
      {/* Role indicator */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: role === 'shadow' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)',
          border: `1px solid ${role === 'shadow' ? s.colors.danger : s.colors.success}`,
          borderRadius: 8,
          padding: '6px 20px',
          fontSize: 14,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {role === 'shadow' ? 'SHADOW' : 'CREW'}
      </div>

      {/* Power indicator with live state */}
      {powerConfig && (
        <PowerStatus
          powerConfig={powerConfig}
          isActive={isActive}
          cooldownEnd={cooldownEnd}
          targetId={targetId}
        />
      )}

      {/* Action buttons */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 12,
          pointerEvents: 'auto',
        }}
      >
        {role === 'shadow' && (
          <button
            style={{
              padding: '10px 24px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${s.colors.danger}`,
              borderRadius: 8,
              color: s.colors.danger,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            KILL [Space]
          </button>
        )}

        <button
          style={{
            padding: '10px 24px',
            background: 'rgba(251, 191, 36, 0.2)',
            border: `1px solid ${s.colors.warning}`,
            borderRadius: 8,
            color: s.colors.warning,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          REPORT [R]
        </button>

        <button
          style={{
            padding: '10px 24px',
            background: 'rgba(109, 40, 217, 0.2)',
            border: `1px solid ${s.colors.primary}`,
            borderRadius: 8,
            color: s.colors.primary,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          EMERGENCY [E]
        </button>
      </div>

      {/* Battery indicator */}
      <BatteryIndicator />

      {/* Crosshair */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.5)',
        }}
      />
    </div>
  );
}
