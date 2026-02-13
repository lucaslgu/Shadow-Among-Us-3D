import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { POWER_CONFIGS, PowerType } from '@shadow/shared';
import type { TaskType } from '@shadow/shared';
import { inputState } from '../networking/mouse-state.js';
import { Minimap } from './Minimap.js';
import * as s from './styles.js';

/* ========================================================================== */
/*  Shared HUD tokens                                                          */
/* ========================================================================== */

const EDGE = 'clamp(10px, 1.2vw, 18px)';
const EDGE_V = 'clamp(8px, 1.2vh, 16px)';
const CARD: React.CSSProperties = {
  background: 'rgba(8, 8, 16, 0.78)',
  border: `1px solid rgba(255,255,255,0.07)`,
  borderRadius: 8,
  backdropFilter: 'blur(6px)',
};
const FONT = "'Segoe UI', system-ui, sans-serif";

/* ========================================================================== */
/*  All HUD keyframe animations (single injection)                             */
/* ========================================================================== */

const HUD_KEYFRAMES = `
@keyframes hudPulse {
  0%, 100% { box-shadow: 0 0 6px var(--pulse-color, rgba(239,68,68,0.3)); }
  50%      { box-shadow: 0 0 16px var(--pulse-color, rgba(239,68,68,0.6)); }
}
@keyframes damageVignette {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
@keyframes oxyBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
`;

/* ========================================================================== */
/*  Hooks                                                                      */
/* ========================================================================== */

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
  useEffect(() => {
    const unsub = useGameStore.subscribe(() => {
      const next = extractPowerState();
      setState((prev) => {
        if (prev.isActive === next.isActive && prev.cooldownEnd === next.cooldownEnd &&
            prev.targetId === next.targetId && prev.powerUsesLeft === next.powerUsesLeft) return prev;
        return next;
      });
    });
    return unsub;
  }, []);
  return { ...state, power: localPower };
}

/* ========================================================================== */
/*  Tiny reusable bar component                                                */
/* ========================================================================== */

function Bar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ width: '100%', height, background: 'rgba(255,255,255,0.08)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, pct))}%`,
        height: '100%',
        background: color,
        borderRadius: height / 2,
        transition: 'width 0.15s linear',
      }} />
    </div>
  );
}

/* ========================================================================== */
/*  Top-left: Role Badge                                                       */
/* ========================================================================== */

function RoleBadge() {
  const role = useGameStore((st) => st.localRole);
  const isGhost = useGameStore((st) => st.isGhost);

  const label = isGhost ? 'GHOST' : role === 'shadow' ? 'SHADOW' : 'CREW';
  const color = isGhost ? '#4488ff' : role === 'shadow' ? s.colors.danger : s.colors.success;

  return (
    <div style={{
      background: `${color}22`,
      border: `1px solid ${color}`,
      borderRadius: 6,
      padding: '3px 12px',
      fontSize: 'clamp(10px, 1.4vw, 12px)',
      fontWeight: 700,
      letterSpacing: 1.5,
      color,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </div>
  );
}

/* ========================================================================== */
/*  Top-center column: Damage labels + Oxygen bar + Oxygen guide               */
/* ========================================================================== */

function DamageLabels() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const isGhost = useGameStore((st) => st.isGhost);

  if (isGhost) return null;
  if (!localPlayerId || !players[localPlayerId]) return null;

  const { damageSource, inShelter, doorProtection } = players[localPlayerId];
  if (damageSource === 'none' && !inShelter && !doorProtection) return null;

  const LABELS: Record<string, { text: string; color: string }> = {
    heat: { text: 'HEAT', color: '#ff8844' },
    cold: { text: 'COLD', color: '#44aaff' },
    fire: { text: 'FIRE', color: '#ff4444' },
    oxygen: { text: 'NO O\u2082', color: '#aa44ff' },
  };

  const parts = damageSource !== 'none' ? damageSource.split('+') : [];
  const items = parts.map((p) => LABELS[p.trim()] ?? { text: p.trim().toUpperCase(), color: s.colors.danger });

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <span key={i} style={{
          background: `${item.color}18`,
          border: `1px solid ${item.color}88`,
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: item.color,
          letterSpacing: 0.5,
        }}>
          {item.text}
        </span>
      ))}
      {inShelter && (
        <span style={{
          background: `${s.colors.success}18`,
          border: `1px solid ${s.colors.success}88`,
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: s.colors.success,
        }}>
          SHELTER
        </span>
      )}
      {doorProtection && !inShelter && (
        <span style={{
          background: 'rgba(68, 170, 255, 0.1)',
          border: '1px solid rgba(68, 170, 255, 0.5)',
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: '#44aaff',
        }}>
          DOORS -50%
        </span>
      )}
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
  const isDepleted = pct <= 0;
  const isRefilling = !!oxygenRefillPlayerId;
  const isMeRefilling = oxygenRefillPlayerId === localPlayerId;
  const refillerName = oxygenRefillPlayerId ? (playerInfo[oxygenRefillPlayerId]?.name ?? '???') : null;

  return (
    <div style={{
      ...CARD,
      padding: '5px 14px',
      minWidth: 'clamp(160px, 20vw, 220px)',
      border: isDepleted ? `1px solid ${s.colors.danger}88` : CARD.border,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#44aaff', letterSpacing: 1 }}>
          O\u2082
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: barColor }}>
          {pct}%
        </span>
      </div>
      <Bar pct={pct} color={barColor} height={4} />
      {isDepleted && (
        <div style={{
          fontSize: 9, color: s.colors.danger, fontWeight: 700, marginTop: 3,
          textAlign: 'center', letterSpacing: 0.5,
          animation: 'oxyBlink 0.8s ease-in-out infinite',
        }}>
          DEPLETED — REFILL!
        </div>
      )}
      {isRefilling && !isDepleted && (
        <div style={{ fontSize: 9, color: s.colors.success, marginTop: 2, textAlign: 'center' }}>
          {isMeRefilling ? 'Refilling...' : `${refillerName} refilling...`}
        </div>
      )}
    </div>
  );
}

function OxygenGuide() {
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const shipOxygen = useGameStore((st) => st.shipOxygen);
  const localPosition = useGameStore((st) => st.localPosition);
  const isGhost = useGameStore((st) => st.isGhost);

  if (isGhost) return null;
  if (!mazeLayout?.oxygenGenerators || mazeLayout.oxygenGenerators.length === 0) return null;
  if (shipOxygen > 50) return null;

  const [px, , pz] = localPosition;
  let nearestGen = mazeLayout.oxygenGenerators[0];
  let nearestDistSq = Infinity;
  for (const gen of mazeLayout.oxygenGenerators) {
    const dx = gen.position[0] - px;
    const dz = gen.position[2] - pz;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) { nearestDistSq = distSq; nearestGen = gen; }
  }
  const dist = Math.round(Math.sqrt(nearestDistSq));

  const dx = nearestGen.position[0] - px;
  const dz = nearestGen.position[2] - pz;
  const angleDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const isUrgent = shipOxygen <= 0;
  const color = isUrgent ? s.colors.danger : s.colors.warning;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '2px 10px',
      background: `${color}10`,
      borderRadius: 6,
      border: `1px solid ${color}44`,
    }}>
      <span style={{
        fontSize: 16, color, lineHeight: 1,
        transform: `rotate(${angleDeg}deg)`,
        transition: 'transform 0.3s ease',
        display: 'inline-block',
      }}>
        {'\u2191'}
      </span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5 }}>
          {isUrgent ? 'REFILL NOW!' : 'O\u2082 Low'}
        </div>
        <div style={{ fontSize: 9, color: s.colors.textMuted }}>
          {nearestGen.roomName} · {dist}m · [G]
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Damage vignette (fullscreen overlay — stays absolute)                      */
/* ========================================================================== */

function DamageVignette() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const isGhost = useGameStore((st) => st.isGhost);

  if (isGhost || !localPlayerId || !players[localPlayerId]) return null;
  const { damageSource, inShelter } = players[localPlayerId];
  if (damageSource === 'none' || inShelter) return null;

  const COLORS: Record<string, string> = { heat: '#ff8844', cold: '#44aaff', fire: '#ff4444', oxygen: '#aa44ff' };
  const parts = damageSource.split('+');
  const mainColor = COLORS[parts[0].trim()] ?? s.colors.danger;

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      border: `2px solid ${mainColor}`,
      boxShadow: `inset 0 0 60px ${mainColor}33, inset 0 0 120px ${mainColor}18`,
      animation: 'damageVignette 1s ease-in-out infinite',
      zIndex: 0,
    }} />
  );
}

/* ========================================================================== */
/*  Top-right: Task List (Tab to toggle)                                       */
/* ========================================================================== */

const TASK_ICONS: Record<string, string> = {
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Tab') { e.preventDefault(); setOpen((p) => !p); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const taskData = useMemo(() => {
    if (!mazeLayout?.tasks || !mazeLayout?.rooms || assignedTasks.length === 0) return [];
    const roomNameMap = new Map<string, string>();
    for (const room of mazeLayout.rooms) roomNameMap.set(room.id, room.name);
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
      id: string; displayName: string; taskType: TaskType;
      roomName: string; position: [number, number, number];
    }>;
  }, [mazeLayout, assignedTasks]);

  if (taskData.length === 0) return null;

  const completedCount = taskData.filter((t) => {
    const ts = mazeSnapshot?.taskStates[t.id];
    return ts?.completionState === 'completed';
  }).length;

  const allStates = mazeSnapshot ? Object.values(mazeSnapshot.taskStates) : [];
  const globalTotal = allStates.length;
  const globalCompleted = allStates.filter((t) => t.completionState === 'completed').length;
  const globalPct = globalTotal > 0 ? Math.round((globalCompleted / globalTotal) * 100) : 0;

  return (
    <>
      <style>{`
        .hud-tasks::-webkit-scrollbar { width: 4px; }
        .hud-tasks::-webkit-scrollbar-track { background: transparent; }
        .hud-tasks::-webkit-scrollbar-thumb { background: ${s.colors.primary}88; border-radius: 2px; }
        .hud-tasks { scrollbar-width: thin; scrollbar-color: ${s.colors.primary}88 transparent; }
      `}</style>
      <div className="hud-tasks" style={{
        ...CARD,
        padding: open ? '6px 10px' : '4px 10px',
        maxWidth: 'min(240px, 38vw)',
        minWidth: 'min(180px, 32vw)',
        maxHeight: open ? '40vh' : 'auto',
        overflowY: open ? 'auto' : 'hidden',
        transition: 'max-height 0.2s ease',
        pointerEvents: 'auto',
      }}>
        <div style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen((p) => !p)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: s.colors.textMuted, letterSpacing: 1 }}>
              TASKS {completedCount}/{taskData.length}
            </span>
            <span style={{ fontSize: 9, color: s.colors.textMuted }}>
              [Tab] {open ? '\u25B2' : '\u25BC'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ flex: 1 }}>
              <Bar pct={globalPct} color={globalPct >= 100 ? s.colors.success : '#44aaff'} height={3} />
            </div>
            <span style={{ fontSize: 9, color: s.colors.textMuted, whiteSpace: 'nowrap' }}>
              {globalTotal - globalCompleted} left
            </span>
          </div>
        </div>

        {open && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {taskData.map((task) => {
              const ts = mazeSnapshot?.taskStates[task.id];
              const state = ts?.completionState ?? 'pending';
              const isCompleted = state === 'completed';
              const isInProgress = state === 'in_progress';
              const icon = TASK_ICONS[task.taskType] ?? '\u{1F4BB}';
              const dx = task.position[0] - localPosition[0];
              const dz = task.position[2] - localPosition[2];
              const dist = Math.round(Math.sqrt(dx * dx + dz * dz));

              return (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 4px', borderRadius: 4,
                  background: isCompleted ? 'rgba(74,222,128,0.06)' : isInProgress ? 'rgba(251,191,36,0.06)' : 'transparent',
                  opacity: isCompleted ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: 12, flexShrink: 0, width: 16, textAlign: 'center' }}>
                    {isCompleted ? '\u2705' : isInProgress ? '\u{1F504}' : icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: isCompleted ? s.colors.success : s.colors.text,
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {task.displayName}
                    </div>
                    <div style={{ fontSize: 9, color: s.colors.textMuted }}>
                      {task.roomName}
                    </div>
                  </div>
                  {!isCompleted && (
                    <span style={{
                      fontSize: 9, flexShrink: 0, whiteSpace: 'nowrap',
                      color: dist < 10 ? s.colors.success : s.colors.textMuted,
                      fontWeight: dist < 10 ? 700 : 400,
                    }}>
                      {dist}m
                    </span>
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

/* ========================================================================== */
/*  Center prompts (all non-positioned, stacked in a flex column)              */
/* ========================================================================== */

function PromptPill({ keybind, label, color, sub }: {
  keybind: string; label: string; color: string; sub?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: `${color}14`,
      border: `1px solid ${color}66`,
      borderRadius: 8,
      padding: '6px 16px',
      // @ts-expect-error CSS custom property
      '--pulse-color': `${color}55`,
      animation: 'hudPulse 1.5s ease-in-out infinite',
    }}>
      <span style={{
        display: 'inline-block', background: color, color: '#000',
        borderRadius: 3, padding: '1px 7px',
        fontWeight: 'bold', fontSize: 11, letterSpacing: 0.5,
      }}>
        {keybind}
      </span>
      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: `${color}aa` }}>{sub}</span>}
    </div>
  );
}

function TaskPrompt() {
  const info = useGameStore((st) => st.nearestInteractTask);
  if (!info) return null;

  const { displayName, taskType, state, isBusy } = info;
  const icon = TASK_ICONS[taskType] ?? '\u{1F4BB}';
  const isCompleted = state === 'completed';

  if (isCompleted) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${s.colors.success}10`,
        border: `1px solid ${s.colors.success}44`,
        borderRadius: 8, padding: '5px 14px',
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, color: s.colors.success, fontWeight: 600 }}>{displayName} — Done</span>
      </div>
    );
  }
  if (isBusy) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${s.colors.warning}10`,
        border: `1px solid ${s.colors.warning}44`,
        borderRadius: 8, padding: '5px 14px',
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, color: s.colors.warning, fontWeight: 600 }}>{displayName} — In use</span>
      </div>
    );
  }
  return <PromptPill keybind="E" label={displayName} color="#44aaff" />;
}

function KillPrompt() {
  const nearestKillTargetId = useGameStore((st) => st.nearestKillTargetId);
  const localRole = useGameStore((st) => st.localRole);
  const playerInfo = useGameStore((st) => st.playerInfo);
  if (localRole !== 'shadow' || !nearestKillTargetId) return null;
  const targetName = playerInfo[nearestKillTargetId]?.name ?? '???';
  return <PromptPill keybind="SPACE" label="KILL" color="#ef4444" sub={targetName} />;
}

function BodyReportPrompt() {
  const nearestBodyId = useGameStore((st) => st.nearestBodyId);
  if (!nearestBodyId) return null;
  return <PromptPill keybind="R" label="REPORT" color="#ef4444" />;
}

function EmergencyPrompt() {
  const nearEmergencyButton = useGameStore((st) => st.nearEmergencyButton);
  const nearestInteractTask = useGameStore((st) => st.nearestInteractTask);
  if (!nearEmergencyButton || nearestInteractTask) return null;
  return <PromptPill keybind="E" label="EMERGENCY" color="#7c3aed" />;
}

/* ========================================================================== */
/*  Bottom-left: Power Status                                                  */
/* ========================================================================== */

function PowerStatus({ powerConfig, isActive, cooldownEnd, targetId, powerUsesLeft }: {
  powerConfig: { displayName: string; type: PowerType; usesPerMatch: number };
  isActive: boolean;
  cooldownEnd: number;
  targetId: string | null;
  powerUsesLeft: number;
}) {
  const now = Date.now();
  const onCooldown = !isActive && cooldownEnd > now;
  const cooldownSec = onCooldown ? Math.ceil((cooldownEnd - now) / 1000) : 0;
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
    statusText = 'Selecting on map...';
    statusColor = s.colors.primary;
  } else if (targetingMode) {
    statusText = 'Select target...';
    statusColor = s.colors.warning;
  } else if (isActive) {
    statusText = 'Active · [Q] off';
    statusColor = s.colors.success;
  } else if (onCooldown) {
    statusText = `CD: ${cooldownSec}s`;
    statusColor = s.colors.warning;
  } else if ((isTeleport || isMuralha) && powerUsesLeft > 0) {
    statusText = isTeleport ? '[Q] use · hold=map' : '[Q] place';
    statusColor = s.colors.primary;
  } else if (hasCharges && powerUsesLeft <= 0) {
    statusText = 'No charges';
    statusColor = s.colors.textMuted;
  } else {
    statusText = '[Q] activate';
    statusColor = s.colors.primary;
  }

  return (
    <div style={{
      ...CARD,
      padding: '6px 12px',
      minWidth: 'clamp(130px, 16vw, 180px)',
      pointerEvents: 'auto',
      border: isActive ? `1px solid ${s.colors.success}66` : CARD.border,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: isActive ? s.colors.success : s.colors.text,
        }}>
          {powerConfig.displayName}
        </span>
        {hasCharges && (
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: powerConfig.usesPerMatch }, (_, i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                border: `1.5px solid ${s.colors.primary}`,
                background: i < powerUsesLeft ? s.colors.primary : 'transparent',
              }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: statusColor, marginTop: 2, fontWeight: 600 }}>
        {statusText}
      </div>
      {isActive && powerConfig.type === PowerType.MIND_CONTROLLER && targetName && (
        <div style={{ fontSize: 9, color: s.colors.warning, marginTop: 1 }}>
          Ctrl: {targetName} (Arrows)
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Bottom-center: Ghost Ability Bar                                           */
/* ========================================================================== */

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

  const abilities = [
    {
      key: 'Q', label: 'POSSESS', color: '#4488ff',
      sub: possessing ? targetName! : onCooldown ? `${cooldownSec}s` : '20s ctrl',
      active: possessing, dim: onCooldown,
    },
    { key: 'F', label: 'LIGHT', color: s.colors.warning, sub: 'toggle', active: false, dim: false },
    { key: 'E', label: 'TASK', color: s.colors.success, sub: 'any task', active: false, dim: false },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
      {abilities.map((a) => (
        <div key={a.key} style={{
          ...CARD,
          padding: '5px 12px',
          textAlign: 'center',
          opacity: a.dim ? 0.5 : 1,
          border: a.active ? `1px solid ${a.color}66` : CARD.border,
          background: a.active ? `${a.color}18` : CARD.background,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: a.color }}>
            [{a.key}] {a.label}
          </div>
          <div style={{ fontSize: 9, color: s.colors.textMuted, marginTop: 1 }}>
            {a.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========================================================================== */
/*  Bottom-right: Vitals (HP + Battery combined)                               */
/* ========================================================================== */

function VitalsPanel() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const [battery, setBattery] = useState({ level: 1, depleted: false, on: true });

  useEffect(() => {
    const id = setInterval(() => {
      setBattery({ level: inputState.batteryLevel, depleted: inputState.batteryDepleted, on: inputState.flashlightOn });
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (!localPlayerId || !players[localPlayerId]) return null;

  const { health, maxHealth } = players[localPlayerId];
  const hpPct = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : 0;
  const hpColor = hpPct > 60 ? s.colors.success : hpPct > 30 ? s.colors.warning : s.colors.danger;
  const isLow = hpPct < 25;

  const battPct = Math.round(battery.level * 100);
  const battColor = battPct > 50 ? s.colors.success : battPct > 20 ? s.colors.warning : s.colors.danger;

  return (
    <div style={{
      ...CARD,
      padding: '6px 12px',
      minWidth: 'clamp(110px, 14vw, 150px)',
      pointerEvents: 'auto',
      border: isLow ? `1px solid ${s.colors.danger}55` : CARD.border,
      // @ts-expect-error CSS custom property
      '--pulse-color': `${s.colors.danger}44`,
      animation: isLow ? 'hudPulse 1s ease-in-out infinite' : undefined,
    }}>
      {/* HP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: hpColor }}>HP</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: hpColor }}>{health}/{maxHealth}</span>
      </div>
      <Bar pct={hpPct} color={hpColor} height={4} />

      {/* Battery */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: s.colors.textMuted }}>
          {'\u26A1'} [F] {battery.on ? 'ON' : 'OFF'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: battColor }}>
          {battPct}%{battery.depleted ? ' \u21BB' : ''}
        </span>
      </div>
      <Bar pct={battPct} color={battColor} height={4} />
    </div>
  );
}

/* ========================================================================== */
/*  Main HUD Layout                                                            */
/* ========================================================================== */

export function GameHUD() {
  const role = useGameStore((st) => st.localRole);
  const power = useGameStore((st) => st.localPower);
  const phase = useGameStore((st) => st.phase);
  const isGhost = useGameStore((st) => st.isGhost);
  const { isActive, cooldownEnd, targetId, powerUsesLeft } = usePowerState();

  if (phase !== 'playing') return null;

  const powerConfig = power ? POWER_CONFIGS[power] : null;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      fontFamily: FONT,
      color: s.colors.text,
      zIndex: 20,
    }}>
      {/* ── Global animations ── */}
      <style>{HUD_KEYFRAMES}</style>

      {/* ── Fullscreen overlays ── */}
      <DamageVignette />
      <Minimap />

      {/* ── Crosshair ── */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 4, height: 4, borderRadius: '50%',
        background: isGhost ? 'rgba(68,136,255,0.5)' : 'rgba(255,255,255,0.5)',
      }} />

      {/* ── TOP-LEFT: Role ── */}
      <div style={{ position: 'absolute', top: EDGE_V, left: EDGE }}>
        <RoleBadge />
      </div>

      {/* ── TOP-CENTER: Status column ── */}
      <div style={{
        position: 'absolute',
        top: EDGE_V,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        maxWidth: '60vw',
      }}>
        <DamageLabels />
        <OxygenBar />
        <OxygenGuide />
      </div>

      {/* ── TOP-RIGHT: Task list ── */}
      <div style={{ position: 'absolute', top: EDGE_V, right: EDGE }}>
        <TaskList />
      </div>

      {/* ── CENTER: Interaction prompts (stacked, no overlap) ── */}
      <div style={{
        position: 'absolute',
        top: '54%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        pointerEvents: 'none',
      }}>
        {!isGhost && <BodyReportPrompt />}
        <TaskPrompt />
        {!isGhost && <KillPrompt />}
        {!isGhost && <EmergencyPrompt />}
      </div>

      {/* ── BOTTOM-LEFT: Power ── */}
      {!isGhost && powerConfig && (
        <div style={{ position: 'absolute', bottom: EDGE_V, left: EDGE }}>
          <PowerStatus
            powerConfig={powerConfig}
            isActive={isActive}
            cooldownEnd={cooldownEnd}
            targetId={targetId}
            powerUsesLeft={powerUsesLeft}
          />
        </div>
      )}

      {/* ── BOTTOM-CENTER: Ghost abilities ── */}
      <div style={{
        position: 'absolute',
        bottom: EDGE_V,
        left: '50%',
        transform: 'translateX(-50%)',
      }}>
        <GhostAbilityBar />
      </div>

      {/* ── BOTTOM-RIGHT: Vitals (HP + Battery) ── */}
      {!isGhost && (
        <div style={{ position: 'absolute', bottom: EDGE_V, right: EDGE }}>
          <VitalsPanel />
        </div>
      )}
    </div>
  );
}
