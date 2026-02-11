import type { Server } from 'socket.io';
import type { ClientEvents, ServerEvents, StateSnapshot, PlayerSnapshot, InputSnapshot } from '@shadow/shared';
import { POWER_CONFIGS, PowerType } from '@shadow/shared';
import { processInput } from '../systems/movement.js';

const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

export interface GamePlayerState {
  sessionToken: string;
  socketId: string;
  name: string;
  role: 'crew' | 'shadow';
  power: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  hasShield: boolean;
  speedMultiplier: number;
  lastProcessedInput: number;
  inputQueue: InputSnapshot[];
  // Power state
  powerActive: boolean;
  powerActiveEnd: number;
  powerCooldownEnd: number;
  powerUsesLeft: number;
  // Mind controller
  mindControlTargetToken: string | null;
  mindControlInput: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number } | null;
  // Original speed (before power modifications)
  baseSpeedMultiplier: number;
  // Original color (for Metamorph revert)
  originalColor: string;
}

export function startGameLoop(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gamePlayers: Map<string, GamePlayerState>,
): ReturnType<typeof setInterval> {
  let tickSeq = 0;

  const interval = setInterval(() => {
    tickSeq++;
    const now = Date.now();

    // Check power expirations
    for (const [, gp] of gamePlayers) {
      if (gp.powerActive && gp.powerActiveEnd > 0 && now >= gp.powerActiveEnd) {
        deactivatePower(io, roomCode, gp, gamePlayers);
      }
    }

    // Process all queued inputs for each player
    for (const [, gp] of gamePlayers) {
      while (gp.inputQueue.length > 0) {
        const input = gp.inputQueue.shift()!;
        processInput(gp, input, TICK_INTERVAL / 1000);
      }
    }

    // Process mind controller arrow-key inputs on target players
    for (const [, gp] of gamePlayers) {
      if (gp.powerActive && gp.power === PowerType.MIND_CONTROLLER && gp.mindControlTargetToken && gp.mindControlInput) {
        const target = gamePlayers.get(gp.mindControlTargetToken);
        if (target && target.isAlive) {
          // Build a fake InputSnapshot from arrow keys
          const fakeInput: InputSnapshot = {
            seq: target.lastProcessedInput,
            forward: gp.mindControlInput.forward,
            backward: gp.mindControlInput.backward,
            left: gp.mindControlInput.left,
            right: gp.mindControlInput.right,
            mouseX: gp.mindControlInput.mouseX,
            mouseY: 0,
            timestamp: now,
          };
          processInput(target, { ...fakeInput, seq: target.lastProcessedInput + 1 }, TICK_INTERVAL / 1000);
        }
      }
    }

    // Build snapshot
    const playersSnapshot: Record<string, PlayerSnapshot> = {};
    for (const [, gp] of gamePlayers) {
      playersSnapshot[gp.socketId] = {
        position: [...gp.position],
        rotation: [...gp.rotation],
        isAlive: gp.isAlive,
        isHidden: gp.isHidden,
        isInvisible: gp.isInvisible,
        speedMultiplier: gp.speedMultiplier,
        lastProcessedInput: gp.lastProcessedInput,
        powerActive: gp.powerActive,
        powerCooldownEnd: gp.powerCooldownEnd,
        mindControlTargetId: gp.mindControlTargetToken
          ? (findSocketIdByToken(gamePlayers, gp.mindControlTargetToken) ?? null)
          : null,
        color: gp.color,
      };
    }

    const snapshot: StateSnapshot = {
      seq: tickSeq,
      timestamp: now,
      players: playersSnapshot,
    };

    io.to(roomCode).emit('game:state-snapshot', snapshot);
  }, TICK_INTERVAL);

  return interval;
}

function findSocketIdByToken(gamePlayers: Map<string, GamePlayerState>, token: string): string | undefined {
  return gamePlayers.get(token)?.socketId;
}

// ===== Power Activation =====

export function activatePower(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gp: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
  targetId?: string,
): boolean {
  const now = Date.now();
  const powerType = gp.power as PowerType;
  const config = POWER_CONFIGS[powerType];
  if (!config) return false;

  // Check cooldown
  if (now < gp.powerCooldownEnd) return false;
  // Already active → toggle off
  if (gp.powerActive) {
    deactivatePower(io, roomCode, gp, gamePlayers);
    return true;
  }

  gp.powerActive = true;
  gp.powerActiveEnd = config.duration > 0 ? now + config.duration : 0;

  // Apply power-specific effects
  switch (powerType) {
    case PowerType.INVISIBLE:
      gp.isInvisible = true;
      break;

    case PowerType.FLASH:
      gp.baseSpeedMultiplier = gp.speedMultiplier;
      gp.speedMultiplier = 3;
      break;

    case PowerType.TIME_CONTROLLER:
      // Freeze all other players
      for (const [, other] of gamePlayers) {
        if (other.socketId !== gp.socketId && other.isAlive) {
          other.baseSpeedMultiplier = other.speedMultiplier;
          other.speedMultiplier = 0;
        }
      }
      break;

    case PowerType.MIND_CONTROLLER: {
      // Find target - nearest player if no explicit target
      const targetToken = targetId
        ? findTokenBySocketId(gamePlayers, targetId)
        : findNearestPlayerToken(gp, gamePlayers);
      if (!targetToken) {
        gp.powerActive = false;
        gp.powerUsesLeft++;
        return false;
      }
      gp.mindControlTargetToken = targetToken;
      break;
    }

    case PowerType.METAMORPH: {
      // Copy a random other player's color (alive or dead)
      const morphTargetToken = targetId
        ? findTokenBySocketId(gamePlayers, targetId)
        : findRandomOtherPlayerToken(gp, gamePlayers);
      if (!morphTargetToken) {
        gp.powerActive = false;
        return false;
      }
      const target = gamePlayers.get(morphTargetToken);
      if (target) {
        gp.originalColor = gp.color;
        gp.color = target.color;
      }
      break;
    }

    case PowerType.TELEPORT: {
      // Teleport to random position within the map
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 20;
      gp.position = [Math.cos(angle) * dist, 0, Math.sin(angle) * dist];
      gp.powerActive = false; // instant
      gp.powerCooldownEnd = now + config.cooldown;
      break;
    }

    case PowerType.MEDIC: {
      // Grant shield to target or revive (for now, shield)
      const medicTargetToken = targetId
        ? findTokenBySocketId(gamePlayers, targetId)
        : findNearestPlayerToken(gp, gamePlayers);
      if (medicTargetToken) {
        const target = gamePlayers.get(medicTargetToken);
        if (target) target.hasShield = true;
      }
      gp.powerActive = false; // instant
      gp.powerCooldownEnd = now + config.cooldown;
      break;
    }

    // Hacker and Necromancer: just mark as active for now
    default:
      break;
  }

  // Set cooldown for duration-based powers (applied on deactivation)
  if (config.duration > 0 && powerType !== PowerType.TELEPORT && powerType !== PowerType.MEDIC) {
    // Cooldown starts after power ends
  }

  io.to(roomCode).emit('power:activated', {
    playerId: gp.socketId,
    powerType,
    targetId: targetId ?? undefined,
  });

  return true;
}

export function deactivatePower(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gp: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
): void {
  if (!gp.powerActive) return;

  const powerType = gp.power as PowerType;
  const config = POWER_CONFIGS[powerType];
  const now = Date.now();

  gp.powerActive = false;
  gp.powerActiveEnd = 0;
  gp.powerCooldownEnd = now + (config?.cooldown ?? 0);

  // Revert power-specific effects
  switch (powerType) {
    case PowerType.INVISIBLE:
      gp.isInvisible = false;
      break;

    case PowerType.FLASH:
      gp.speedMultiplier = gp.baseSpeedMultiplier;
      break;

    case PowerType.TIME_CONTROLLER:
      // Unfreeze all players
      for (const [, other] of gamePlayers) {
        if (other.socketId !== gp.socketId && other.speedMultiplier === 0) {
          other.speedMultiplier = other.baseSpeedMultiplier;
        }
      }
      break;

    case PowerType.MIND_CONTROLLER:
      gp.mindControlTargetToken = null;
      gp.mindControlInput = null;
      break;

    case PowerType.METAMORPH:
      gp.color = gp.originalColor;
      break;

    default:
      break;
  }

  io.to(roomCode).emit('power:ended', { playerId: gp.socketId, powerType });
}

function findTokenBySocketId(gamePlayers: Map<string, GamePlayerState>, socketId: string): string | null {
  for (const [token, gp] of gamePlayers) {
    if (gp.socketId === socketId) return token;
  }
  return null;
}

function findRandomOtherPlayerToken(source: GamePlayerState, gamePlayers: Map<string, GamePlayerState>): string | null {
  const others: string[] = [];
  for (const [token, gp] of gamePlayers) {
    if (gp.socketId !== source.socketId) others.push(token);
  }
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)];
}

function findNearestPlayerToken(source: GamePlayerState, gamePlayers: Map<string, GamePlayerState>): string | null {
  let nearest: string | null = null;
  let minDist = Infinity;
  const [sx, , sz] = source.position;

  for (const [token, gp] of gamePlayers) {
    if (gp.socketId === source.socketId || !gp.isAlive) continue;
    const [px, , pz] = gp.position;
    const dist = Math.sqrt((px - sx) ** 2 + (pz - sz) ** 2);
    if (dist < minDist && dist < 10) { // 10 unit range
      minDist = dist;
      nearest = token;
    }
  }
  return nearest;
}
