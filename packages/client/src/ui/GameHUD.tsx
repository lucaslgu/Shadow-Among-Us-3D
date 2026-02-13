import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { POWER_CONFIGS, PowerType } from '@shadow/shared';
import type { TaskType } from '@shadow/shared';
import { inputState } from '../networking/mouse-state.js';
import { Minimap } from './Minimap.js';
import * as s from './styles.js';

interface PowerStateInfo {
  isActive: boolean;
  cooldownEnd: number;
  targetId: string | null;
  powerUsesLeft: number;
}

const DEFAULT_POWER_STATE: PowerStateInfo = { isActive: false, cooldownEnd: 0, targetId: null, powerUsesLeft: 0 };

function extractPowerState(): PowerStateInfo {
  const { localPlayerId, players } = useGameStore.getState();
  if (!localPlayerId) return DEFAULT_POWER_STATE;
  const snap = players[localPlayerId];
  if (!snap) return DEFAULT_POWER_STATE;
  return {
    isActive: snap.powerActive,
    cooldownEnd: snap.powerCooldownEnd,
    targetId: snap.mindControlTargetId,
    powerUsesLeft: snap.powerUsesLeft ?? 0,
  };
}

function usePowerState() {
  const localPower = useGameStore((st) => st.localPower);
  const [state, setState] = useState<PowerStateInfo>(extractPowerState);

  // Subscribe to store changes but only re-render when power fields actually change
  useEffect(() => {
    const unsub = useGameStore.subscribe(() => {
      const next = extractPowerState();
      setState((prev) => {
        if (prev.isActive === next.isActive && prev.cooldownEnd === next.cooldownEnd &&
            prev.targetId === next.targetId && prev.powerUsesLeft === next.powerUsesLeft) {
          return prev; // same reference → no re-render
        }
        return next;
      });
    });
    return unsub;
  }, []);

  return { ...state, power: localPower };
}

function PowerStatus({ powerConfig, isActive, cooldownEnd, targetId, powerUsesLeft }: {
  powerConfig: { displayName: string; description: string; type: PowerType; usesPerMatch: number };
  isActive: boolean;
  cooldownEnd: number;
  targetId: string | null;
  powerUsesLeft: number;
}) {
  const now = Date.now();
  const onCooldown = !isActive && cooldownEnd > now;
  const cooldownRemaining = onCooldown ? Math.ceil((cooldownEnd - now) / 1000) : 0;
  const playerInfo = useGameStore((st) => st.playerInfo);
  const targetingMode = useGameStore((st) => st.targetingMode);
  const teleportMapOpen = useGameStore((st) => st.teleportMapOpen);
  const targetName = targetId ? (playerInfo[targetId]?.name ?? '???') : null;
  const isTeleport = powerConfig.type === PowerType.TELEPORT;
  const isMuralha = powerConfig.type === PowerType.MURALHA;
  const hasCharges = powerConfig.usesPerMatch > 1;

  let statusText: string;
  let statusColor: string;
  if (teleportMapOpen) {
    statusText = 'SELECT DESTINATION ON MAP...';
    statusColor = s.colors.primary;
  } else if (targetingMode) {
    statusText = 'SELECT A TARGET...';
    statusColor = s.colors.warning;
  } else if (isActive) {
    statusText = 'ACTIVE - Press [Q] to deactivate';
    statusColor = s.colors.success;
  } else if (onCooldown) {
    statusText = `Cooldown: ${cooldownRemaining}s`;
    statusColor = s.colors.warning;
  } else if (isTeleport && powerUsesLeft > 0) {
    statusText = '[Q] Teleport | Hold [Q] Open map';
    statusColor = s.colors.primary;
  } else if (isMuralha && powerUsesLeft > 0) {
    statusText = '[Q] Place wall';
    statusColor = s.colors.primary;
  } else if (hasCharges && powerUsesLeft <= 0) {
    statusText = 'No charges left';
    statusColor = s.colors.textMuted;
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
      {/* Charge dots (for multi-charge powers like Teleport, Muralha) */}
      {hasCharges && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: s.colors.textMuted, marginRight: 4 }}>Charges:</span>
          {Array.from({ length: powerConfig.usesPerMatch }, (_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: `2px solid ${s.colors.primary}`,
                background: i < powerUsesLeft ? s.colors.primary : 'transparent',
              }}
            />
          ))}
        </div>
      )}
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

function TaskCounter() {
  const mazeSnapshot = useGameStore((st) => st.mazeSnapshot);
  const assignedTasks = useGameStore((st) => st.assignedTasks);
  if (!mazeSnapshot || assignedTasks.length === 0) return null;

  // Personal progress: only my assigned tasks
  const myTotal = assignedTasks.length;
  const myCompleted = assignedTasks.filter((id) => {
    const ts = mazeSnapshot.taskStates[id];
    return ts?.completionState === 'completed';
  }).length;

  // Global progress bar (all tasks)
  const allStates = Object.values(mazeSnapshot.taskStates);
  const globalTotal = allStates.length;
  const globalCompleted = allStates.filter((t) => t.completionState === 'completed').length;
  const globalPct = globalTotal > 0 ? Math.round((globalCompleted / globalTotal) * 100) : 0;

  const allMyDone = myCompleted === myTotal;

  return (
    <div
      style={{
        background: 'rgba(10, 10, 18, 0.85)',
        border: `1px solid ${allMyDone ? s.colors.success : s.colors.border}`,
        borderRadius: 8,
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: allMyDone ? s.colors.success : s.colors.text,
        minWidth: 140,
      }}
    >
      <div>Mine: {myCompleted}/{myTotal}</div>
      {/* Global task progress bar */}
      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${globalPct}%`,
          height: '100%',
          background: globalCompleted === globalTotal ? s.colors.success : '#44aaff',
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ fontSize: 10, color: s.colors.textMuted, marginTop: 2 }}>
        Global: {globalCompleted}/{globalTotal}
      </div>
    </div>
  );
}

const TASK_TYPE_ICONS: Record<string, string> = {
  scanner_bioidentificacao: '\u{1F9EC}',
  esvaziar_lixo: '\u{1F5D1}',
  painel_energia: '\u26A1',
  canhao_asteroides: '\u{1F680}',
  leitor_cartao: '\u{1F4B3}',
  motores: '\u2699',
  generic: '\u{1F4BB}',
};

function TaskPrompt() {
  const info = useGameStore((st) => st.nearestInteractTask);
  if (!info) return null;

  const { displayName, taskType, state, isBusy } = info;
  const icon = TASK_TYPE_ICONS[taskType] ?? '\u{1F4BB}';

  const isCompleted = state === 'completed';
  const borderColor = isCompleted ? s.colors.success : isBusy ? s.colors.warning : '#44aaff';

  return (
    <div
      style={{
        position: 'absolute',
        top: '56%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(5, 8, 18, 0.9)',
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        padding: '10px 20px',
        textAlign: 'center',
        animation: isCompleted ? undefined : 'taskPromptPulse 2s ease-in-out infinite',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes taskPromptPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(68, 170, 255, 0.3); }
          50% { box-shadow: 0 0 20px rgba(68, 170, 255, 0.6); }
        }
      `}</style>
      <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
        {displayName}
      </div>
      {isCompleted ? (
        <div style={{ fontSize: 12, color: s.colors.success, fontWeight: 600 }}>
          Completed
        </div>
      ) : isBusy ? (
        <div style={{ fontSize: 12, color: s.colors.warning, fontWeight: 600 }}>
          In use by another player
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              background: '#44aaff',
              color: '#000',
              borderRadius: 4,
              padding: '2px 8px',
              fontWeight: 'bold',
              fontSize: 13,
              letterSpacing: 1,
            }}
          >
            E
          </span>
          <span style={{ fontSize: 13, color: '#aabbdd', fontWeight: 600 }}>
            Interact
          </span>
        </div>
      )}
    </div>
  );
}

function HealthBar() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);

  if (!localPlayerId || !players[localPlayerId]) return null;

  const { health, maxHealth } = players[localPlayerId];
  const pct = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : 0;
  const barColor = pct > 60 ? s.colors.success : pct > 30 ? s.colors.warning : s.colors.danger;
  const isLow = pct < 25;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 88,
        right: 24,
        background: 'rgba(10, 10, 18, 0.85)',
        border: `1px solid ${isLow ? s.colors.danger : s.colors.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 140,
        pointerEvents: 'auto',
        animation: isLow ? 'healthPulse 1s ease-in-out infinite' : undefined,
      }}
    >
      <style>{`
        @keyframes healthPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.7); }
        }
      `}</style>
      <div style={{ fontSize: 11, color: s.colors.textMuted, marginBottom: 4 }}>
        HP
      </div>
      <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 5,
            transition: 'width 0.15s linear',
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: barColor, marginTop: 4, fontWeight: 600, textAlign: 'center' }}>
        {health} / {maxHealth}
      </div>
    </div>
  );
}

function DamageSourceIndicator() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const isGhost = useGameStore((st) => st.isGhost);

  if (isGhost) return null;
  if (!localPlayerId || !players[localPlayerId]) return null;

  const { damageSource, inShelter, doorProtection } = players[localPlayerId];

  if (damageSource === 'none' && !inShelter && !doorProtection) return null;

  const LABELS: Record<string, { text: string; color: string }> = {
    heat: { text: 'EXTREME HEAT', color: '#ff8844' },
    cold: { text: 'EXTREME COLD', color: '#44aaff' },
    fire: { text: 'ON FIRE', color: '#ff4444' },
    oxygen: { text: 'NO OXYGEN', color: '#aa44ff' },
  };

  const parts = damageSource !== 'none' ? damageSource.split('+') : [];
  const damageItems = parts.map((p) => LABELS[p.trim()] ?? { text: p.trim().toUpperCase(), color: s.colors.danger });
  const mainColor = damageItems[0]?.color ?? s.colors.danger;
  const isTakingDamage = damageSource !== 'none';

  return (
    <>
      {/* Full-screen damage vignette */}
      {isTakingDamage && !inShelter && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            border: `3px solid ${mainColor}`,
            borderRadius: 0,
            boxShadow: `inset 0 0 80px ${mainColor}44, inset 0 0 160px ${mainColor}22`,
            animation: 'damageVignette 1s ease-in-out infinite',
            zIndex: 0,
          }}
        />
      )}
      <style>{`
        @keyframes damageVignette {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Damage source label */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        {isTakingDamage && !inShelter && damageItems.map((item, i) => (
          <div
            key={i}
            style={{
              background: `${item.color}22`,
              border: `1px solid ${item.color}`,
              borderRadius: 6,
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: item.color,
              letterSpacing: 1,
            }}
          >
            {item.text}
          </div>
        ))}
        {inShelter && (
          <div
            style={{
              background: 'rgba(74, 222, 128, 0.15)',
              border: `1px solid ${s.colors.success}`,
              borderRadius: 6,
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: s.colors.success,
              letterSpacing: 1,
            }}
          >
            SHELTER: PROTECTED
          </div>
        )}
        {doorProtection && !inShelter && (
          <div
            style={{
              background: 'rgba(68, 170, 255, 0.15)',
              border: '1px solid #44aaff',
              borderRadius: 6,
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: '#44aaff',
              letterSpacing: 1,
            }}
          >
            DOORS CLOSED: -50% DAMAGE
          </div>
        )}
      </div>
    </>
  );
}

function GhostAbilityBar() {
  const isGhost = useGameStore((st) => st.isGhost);
  const ghostPossessTarget = useGameStore((st) => st.ghostPossessTarget);
  const ghostPossessCooldownEnd = useGameStore((st) => st.ghostPossessCooldownEnd);
  const playerInfo = useGameStore((st) => st.playerInfo);

  if (!isGhost) return null;

  const now = Date.now();
  const possessing = !!ghostPossessTarget;
  const onCooldown = !possessing && ghostPossessCooldownEnd > now;
  const cooldownSec = onCooldown ? Math.ceil((ghostPossessCooldownEnd - now) / 1000) : 0;
  const targetName = ghostPossessTarget ? (playerInfo[ghostPossessTarget]?.name ?? '???') : null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      {/* Possess */}
      <div
        style={{
          background: possessing ? 'rgba(68, 136, 255, 0.3)' : 'rgba(10, 10, 18, 0.85)',
          border: `1px solid ${possessing ? '#4488ff' : onCooldown ? s.colors.textMuted : '#4488ff'}`,
          borderRadius: 8,
          padding: '8px 16px',
          textAlign: 'center',
          opacity: onCooldown ? 0.5 : 1,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4488ff' }}>
          [Q] POSSESS
        </div>
        <div style={{ fontSize: 10, color: s.colors.textMuted }}>
          {possessing
            ? `Controlling: ${targetName}`
            : onCooldown
            ? `Cooldown: ${cooldownSec}s`
            : '20s control'}
        </div>
      </div>

      {/* Toggle light */}
      <div
        style={{
          background: 'rgba(10, 10, 18, 0.85)',
          border: `1px solid ${s.colors.warning}`,
          borderRadius: 8,
          padding: '8px 16px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: s.colors.warning }}>
          [F] LIGHT
        </div>
        <div style={{ fontSize: 10, color: s.colors.textMuted }}>
          Toggle light on/off
        </div>
      </div>

      {/* Task */}
      <div
        style={{
          background: 'rgba(10, 10, 18, 0.85)',
          border: `1px solid ${s.colors.success}`,
          borderRadius: 8,
          padding: '8px 16px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: s.colors.success }}>
          [E] TASK
        </div>
        <div style={{ fontSize: 10, color: s.colors.textMuted }}>
          Any task
        </div>
      </div>
    </div>
  );
}

function OxygenBar() {
  const shipOxygen = useGameStore((st) => st.shipOxygen);
  const oxygenRefillPlayerId = useGameStore((st) => st.oxygenRefillPlayerId);
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const playerInfo = useGameStore((st) => st.playerInfo);

  const pct = Math.round(shipOxygen);
  const barColor = pct > 60 ? '#44aaff' : pct > 25 ? s.colors.warning : s.colors.danger;
  const isLow = pct <= 25;
  const isDepleted = pct <= 0;
  const isRefilling = !!oxygenRefillPlayerId;
  const isMeRefilling = oxygenRefillPlayerId === localPlayerId;
  const refillerName = oxygenRefillPlayerId ? (playerInfo[oxygenRefillPlayerId]?.name ?? '???') : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10, 10, 18, 0.85)',
        border: `1px solid ${isDepleted ? s.colors.danger : isLow ? s.colors.warning : '#44aaff'}`,
        borderRadius: 10,
        padding: '8px 18px',
        minWidth: 200,
        pointerEvents: 'none',
        animation: isDepleted ? 'oxyPulse 1s ease-in-out infinite' : undefined,
      }}
    >
      <style>{`
        @keyframes oxyPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 18px rgba(239, 68, 68, 0.7); }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#44aaff', letterSpacing: 1 }}>
          SHIP OXYGEN
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor }}>
          {pct}%
        </span>
      </div>
      <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 4,
            transition: 'width 0.15s linear',
          }}
        />
      </div>
      {isDepleted && (
        <div style={{ fontSize: 11, color: s.colors.danger, fontWeight: 700, marginTop: 4, textAlign: 'center', letterSpacing: 1 }}>
          OXYGEN DEPLETED - REFILL AT GENERATORS!
        </div>
      )}
      {isRefilling && !isDepleted && (
        <div style={{ fontSize: 10, color: s.colors.success, marginTop: 4, textAlign: 'center' }}>
          {isMeRefilling ? 'Refilling oxygen...' : `${refillerName} is refilling...`}
        </div>
      )}
    </div>
  );
}

function OxygenGuide() {
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const shipOxygen = useGameStore((st) => st.shipOxygen);
  const localPosition = useGameStore((st) => st.localPosition);

  if (!mazeLayout?.oxygenGenerators || mazeLayout.oxygenGenerators.length === 0) return null;
  if (shipOxygen > 50) return null; // Only show when oxygen is below 50%

  // Find nearest oxygen generator
  const [px, , pz] = localPosition;
  let nearestGen = mazeLayout.oxygenGenerators[0];
  let nearestDistSq = Infinity;
  for (const gen of mazeLayout.oxygenGenerators) {
    const dx = gen.position[0] - px;
    const dz = gen.position[2] - pz;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestGen = gen;
    }
  }

  const dist = Math.round(Math.sqrt(nearestDistSq));

  // Compute arrow direction (angle from player to generator)
  const dx = nearestGen.position[0] - px;
  const dz = nearestGen.position[2] - pz;
  // Convert to screen angle: atan2 gives angle from +X axis, CSS rotate is clockwise from top
  const angleRad = Math.atan2(dx, -dz); // screen: up = -z, right = +x
  const angleDeg = (angleRad * 180) / Math.PI;

  const isUrgent = shipOxygen <= 0;
  const borderColor = isUrgent ? s.colors.danger : s.colors.warning;

  return (
    <div
      style={{
        position: 'absolute',
        top: 170,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10, 10, 18, 0.9)',
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'none',
        animation: isUrgent ? 'oxyGuidePulse 0.8s ease-in-out infinite' : undefined,
        minWidth: 200,
      }}
    >
      <style>{`
        @keyframes oxyGuidePulse {
          0%, 100% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 18px rgba(239, 68, 68, 0.8); }
        }
      `}</style>

      {/* Direction arrow */}
      <div
        style={{
          fontSize: 22,
          transform: `rotate(${angleDeg}deg)`,
          transition: 'transform 0.3s ease',
          lineHeight: 1,
          color: borderColor,
        }}
      >
        {'\u2191'}
      </div>

      {/* Info */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: borderColor, letterSpacing: 1 }}>
          {isUrgent ? 'REFILL OXYGEN NOW!' : 'Oxygen low'}
        </div>
        <div style={{ fontSize: 11, color: s.colors.text }}>
          {nearestGen.roomName} ({dist}m)
        </div>
        <div style={{ fontSize: 10, color: s.colors.textMuted }}>
          [G] to refill at generator
        </div>
      </div>
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

// ── Task List Panel (T to toggle) ──

const TASK_LIST_ICONS: Record<string, string> = {
  scanner_bioidentificacao: '\u{1F9EC}',
  esvaziar_lixo: '\u{1F5D1}',
  painel_energia: '\u26A1',
  canhao_asteroides: '\u{1F680}',
  leitor_cartao: '\u{1F4B3}',
  motores: '\u2699',
  generic: '\u{1F4BB}',
};

function TaskList() {
  const [open, setOpen] = useState(true);
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const mazeSnapshot = useGameStore((st) => st.mazeSnapshot);
  const assignedTasks = useGameStore((st) => st.assignedTasks);
  const localPosition = useGameStore((st) => st.localPosition);

  // Tab key toggles panel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Tab') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Build task data with room names
  const taskData = useMemo(() => {
    if (!mazeLayout?.tasks || !mazeLayout?.rooms || assignedTasks.length === 0) return [];
    const roomNameMap = new Map<string, string>();
    for (const room of mazeLayout.rooms) {
      roomNameMap.set(room.id, room.name);
    }
    const taskMap = new Map(mazeLayout.tasks.map((t) => [t.id, t]));
    return assignedTasks.map((taskId) => {
      const task = taskMap.get(taskId);
      if (!task) return null;
      return {
        id: task.id,
        displayName: task.displayName,
        taskType: task.taskType as TaskType,
        roomName: roomNameMap.get(task.roomId) ?? '???',
        position: task.position,
      };
    }).filter(Boolean) as Array<{
      id: string;
      displayName: string;
      taskType: TaskType;
      roomName: string;
      position: [number, number, number];
    }>;
  }, [mazeLayout, assignedTasks]);

  if (taskData.length === 0) return null;

  const completedCount = taskData.filter((t) => {
    const ts = mazeSnapshot?.taskStates[t.id];
    return ts?.completionState === 'completed';
  }).length;

  return (
    <>
    <style>{`
      .task-list-scroll::-webkit-scrollbar { width: 6px; }
      .task-list-scroll::-webkit-scrollbar-track { background: ${s.colors.surface}; border-radius: 3px; }
      .task-list-scroll::-webkit-scrollbar-thumb { background: ${s.colors.primary}; border-radius: 3px; }
      .task-list-scroll::-webkit-scrollbar-thumb:hover { background: ${s.colors.primaryHover}; }
      .task-list-scroll { scrollbar-width: thin; scrollbar-color: ${s.colors.primary} ${s.colors.surface}; }
    `}</style>
    <div
      className="task-list-scroll"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(10, 10, 18, 0.88)',
        border: `1px solid ${s.colors.border}`,
        borderRadius: 10,
        padding: open ? '10px 14px' : '8px 14px',
        pointerEvents: 'auto',
        maxWidth: 280,
        minWidth: 220,
        maxHeight: open ? '45vh' : 'auto',
        overflowY: open ? 'auto' : 'hidden',
        transition: 'max-height 0.2s ease',
      }}
    >
      {/* Header — always visible */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: s.colors.textMuted, letterSpacing: 1 }}>
          TASKS {completedCount}/{taskData.length}
        </div>
        <div style={{ fontSize: 10, color: s.colors.textMuted }}>
          [Tab] {open ? '\u25B2' : '\u25BC'}
        </div>
      </div>

      {/* Task items */}
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {taskData.map((task) => {
            const ts = mazeSnapshot?.taskStates[task.id];
            const state = ts?.completionState ?? 'pending';
            const isCompleted = state === 'completed';
            const isInProgress = state === 'in_progress';
            const icon = TASK_LIST_ICONS[task.taskType] ?? '\u{1F4BB}';

            // Distance from player
            const dx = task.position[0] - localPosition[0];
            const dz = task.position[2] - localPosition[2];
            const dist = Math.round(Math.sqrt(dx * dx + dz * dz));

            return (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 6px',
                  borderRadius: 6,
                  background: isCompleted
                    ? 'rgba(74, 222, 128, 0.08)'
                    : isInProgress
                    ? 'rgba(251, 191, 36, 0.1)'
                    : 'rgba(255, 255, 255, 0.03)',
                  opacity: isCompleted ? 0.6 : 1,
                }}
              >
                {/* Status indicator */}
                <div style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: 'center' }}>
                  {isCompleted ? '\u2705' : isInProgress ? '\u{1F504}' : icon}
                </div>

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isCompleted ? s.colors.success : s.colors.text,
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {task.displayName}
                  </div>
                  <div style={{ fontSize: 10, color: s.colors.textMuted }}>
                    {task.roomName}
                  </div>
                </div>

                {/* Distance */}
                {!isCompleted && (
                  <div
                    style={{
                      fontSize: 10,
                      color: dist < 10 ? s.colors.success : s.colors.textMuted,
                      fontWeight: dist < 10 ? 700 : 400,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dist}m
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

function BodyReportPrompt() {
  const nearestBodyId = useGameStore((st) => st.nearestBodyId);
  if (!nearestBodyId) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '48%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(239, 68, 68, 0.15)',
        border: '2px solid #ef4444',
        borderRadius: 12,
        padding: '10px 24px',
        textAlign: 'center',
        animation: 'reportPulse 1.2s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <style>{`
        @keyframes reportPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 24px rgba(239, 68, 68, 0.7); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            background: '#ef4444',
            color: '#000',
            borderRadius: 4,
            padding: '2px 10px',
            fontWeight: 'bold',
            fontSize: 14,
            letterSpacing: 1,
          }}
        >
          R
        </span>
        <span style={{ fontSize: 15, color: '#ff6b6b', fontWeight: 700 }}>
          REPORTAR CORPO
        </span>
      </div>
    </div>
  );
}

function EmergencyPrompt() {
  const nearEmergencyButton = useGameStore((st) => st.nearEmergencyButton);
  const nearestInteractTask = useGameStore((st) => st.nearestInteractTask);
  // Don't show emergency prompt if there's a nearby interactable task
  if (!nearEmergencyButton || nearestInteractTask) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '62%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(109, 40, 217, 0.15)',
        border: '2px solid #7c3aed',
        borderRadius: 12,
        padding: '8px 20px',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            background: '#7c3aed',
            color: '#fff',
            borderRadius: 4,
            padding: '2px 10px',
            fontWeight: 'bold',
            fontSize: 14,
            letterSpacing: 1,
          }}
        >
          E
        </span>
        <span style={{ fontSize: 14, color: '#a78bfa', fontWeight: 700 }}>
          EMERGENCY
        </span>
      </div>
    </div>
  );
}

export function GameHUD() {
  const role = useGameStore((st) => st.localRole);
  const power = useGameStore((st) => st.localPower);
  const phase = useGameStore((st) => st.phase);
  const isGhost = useGameStore((st) => st.isGhost);
  const { isActive, cooldownEnd, targetId, powerUsesLeft } = usePowerState();

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
      {/* Minimap */}
      <Minimap />

      {/* Role indicator + Task counter */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {isGhost ? (
          <div
            style={{
              background: 'rgba(68, 136, 255, 0.3)',
              border: '1px solid #4488ff',
              borderRadius: 8,
              padding: '6px 20px',
              fontSize: 14,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#4488ff',
            }}
          >
            GHOST
          </div>
        ) : (
          <div
            style={{
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
        )}
        <TaskCounter />
      </div>

      {/* Ship oxygen bar */}
      <OxygenBar />

      {/* Oxygen guide — points to nearest generator when O2 is low */}
      {!isGhost && <OxygenGuide />}

      {/* Damage source indicator (alive only) */}
      <DamageSourceIndicator />

      {/* Ghost ability bar (ghost only) */}
      {isGhost && <GhostAbilityBar />}

      {/* Power indicator with live state (alive only) */}
      {!isGhost && powerConfig && (
        <PowerStatus
          powerConfig={powerConfig}
          isActive={isActive}
          cooldownEnd={cooldownEnd}
          targetId={targetId}
          powerUsesLeft={powerUsesLeft}
        />
      )}

      {/* Context-aware body report prompt (alive only) */}
      {!isGhost && <BodyReportPrompt />}

      {/* Emergency button prompt (alive only) */}
      {!isGhost && <EmergencyPrompt />}

      {/* Task list panel (top-right, Tab to toggle) */}
      <TaskList />

      {/* Task interaction prompt (screen space — guaranteed visible) */}
      <TaskPrompt />

      {/* Health bar (alive only) */}
      {!isGhost && <HealthBar />}

      {/* Battery indicator (alive only) */}
      {!isGhost && <BatteryIndicator />}

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
          background: isGhost ? 'rgba(68, 136, 255, 0.5)' : 'rgba(255, 255, 255, 0.5)',
        }}
      />
    </div>
  );
}
