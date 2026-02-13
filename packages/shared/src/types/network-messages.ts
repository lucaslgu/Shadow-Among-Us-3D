import type { GamePhase, GameSettings } from './game-state.js';
import type { InputSnapshot, PlayerState, Vec3 } from './player.js';
import type { PowerType } from './powers.js';
import type { MazeLayout, MazeSnapshot } from '../maze/maze-types.js';
import type { CosmicScenario } from './cosmic-scenario.js';

// ===== Nearby Target (for target selection UI) =====

export interface NearbyTarget {
  id: string;
  name: string;
  color: string;
  distance: number;
}

// ===== Room Listing =====

export interface RoomInfo {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  phase: GamePhase;
}

export interface RoomListPage {
  rooms: RoomInfo[];
  total: number;
  page: number;
  totalPages: number;
}

// ===== Lobby Player =====

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  color: string;
}

// ===== Client -> Server Events (Socket.io expects function signatures) =====

export interface ClientEvents {
  'player:join': (data: { name: string; roomCode: string; password?: string }) => void;
  'player:create-room': (data: { name: string; password?: string; maxPlayers?: number }) => void;
  'player:leave-room': () => void;
  'player:close-room': () => void;
  'player:kick': (data: { targetId: string }) => void;
  'player:transfer-host': (data: { targetId: string }) => void;
  'player:reconnect': (data: { sessionToken: string }) => void;
  'player:ready': (data: { ready: boolean }) => void;
  'player:select-color': (data: { color: string }) => void;
  'player:input': (data: InputSnapshot) => void;
  'player:interact': (data: { targetId: string }) => void;
  'rooms:list': (data: { page: number; limit: number }) => void;
  'game:start': () => void;
  'power:activate': (data: { targetId?: string; locationId?: string; wallPosition?: [number, number]; teleportPosition?: [number, number] }) => void;
  'power:deactivate': () => void;
  'power:request-targets': () => void;
  'mind-control:input': (data: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number }) => void;
  'mind-control:activate-power': () => void;
  'kill:attempt': (data: { targetId: string }) => void;
  'body:report': (data: { bodyId: string }) => void;
  'meeting:emergency': () => void;
  'vote:cast': (data: { targetId: string | null }) => void;
  'chat:message': (data: { text: string }) => void;
  'door:interact': (data: { doorId: string }) => void;
  'hacker:action': (data: { targetType: 'door' | 'light' | 'wall'; targetId: string }) => void;
  'task:start': (data: { taskId: string }) => void;
  'task:complete': (data: { taskId: string }) => void;
  'task:cancel': (data: { taskId: string }) => void;
  'oxygen:start-refill': (data: { generatorId: string }) => void;
  'oxygen:cancel-refill': () => void;
  'oxygen:complete-refill': (data: { generatorId: string }) => void;
  'player:loaded': () => void;
  'debug:cycle-power': () => void; // TODO: remove after testing
  // Ghost events
  'ghost:possess': (data: { targetId: string }) => void;
  'ghost:release-possess': () => void;
  'ghost:possess-input': (data: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number }) => void;
  'ghost:toggle-light': (data: { lightId: string }) => void;
  'ghost:task-start': (data: { taskId: string }) => void;
  'ghost:task-complete': (data: { taskId: string }) => void;
  'ghost:task-cancel': (data: { taskId: string }) => void;
  // Pipe system events
  'pipe:enter': (data: { pipeNodeId: string }) => void;
  'pipe:exit': (data: { pipeNodeId: string }) => void;
  'pipe:travel': (data: { destinationNodeId: string }) => void;
  // Death choice (ghost, lobby, leave)
  'death:choice': (data: { choice: 'ghost' | 'lobby' | 'leave' }) => void;
}

// ===== Server -> Client Events =====

export interface ServerEvents {
  'connection:welcome': (data: { playerId: string; sessionToken: string }) => void;
  'room:created': (data: { roomCode: string }) => void;
  'room:joined': (data: { gameState: SerializedGameState; lobbyPlayers: LobbyPlayer[] }) => void;
  'room:reconnected': (data: { gameState: SerializedGameState; lobbyPlayers: LobbyPlayer[] }) => void;
  'room:error': (data: { message: string }) => void;
  'room:players': (data: { players: LobbyPlayer[] }) => void;
  'room:kicked': (data: { reason: string }) => void;
  'room:closed': (data: { reason: string }) => void;
  'rooms:list': (data: RoomListPage) => void;
  'player:joined': (data: { player: PlayerState }) => void;
  'player:left': (data: { playerId: string }) => void;
  'player:ready': (data: { playerId: string; ready: boolean }) => void;
  'game:started': (data: { role: string; power: PowerType; playerInfo: Record<string, { name: string; color: string }>; mazeLayout: MazeLayout; cosmicScenario: CosmicScenario; assignedTasks: string[] }) => void;
  'game:state-snapshot': (data: StateSnapshot) => void;
  'game:phase-change': (data: { phase: GamePhase }) => void;
  'power:activated': (data: { playerId: string; powerType: PowerType; targetId?: string; copiedPower?: PowerType }) => void;
  'power:ended': (data: { playerId: string; powerType: PowerType }) => void;
  'power:nearby-targets': (data: { targets: NearbyTarget[] }) => void;
  'power:no-targets': () => void;
  'kill:occurred': (data: { killerId: string; victimId: string; bodyId: string; bodyPosition: Vec3 }) => void;
  'meeting:started': (data: { reporterId: string; bodyId?: string }) => void;
  'meeting:voting-phase': () => void;
  'meeting:emergency-failed': (data: { reason: string }) => void;
  'vote:confirmed': () => void;
  'vote:result': (data: { ejectedId: string | null; votes: Record<string, string | null> }) => void;
  'game:ended': (data: {
    winner: 'crew' | 'shadow';
    reason: string;
    roles: Record<string, { name: string; color: string; role: string }>;
    stats: { tasksCompleted: number; totalTasks: number; gameDurationSec: number };
  }) => void;
  'game:player-returned-to-lobby': (data: { playerName: string }) => void;
  'chat:message': (data: { playerId: string; text: string }) => void;
  'task:started': (data: { taskId: string; playerId: string }) => void;
  'task:completed': (data: { taskId: string; playerId: string }) => void;
  'task:cancelled': (data: { taskId: string; playerId: string }) => void;
  'task:start-failed': (data: { taskId: string; reason: string }) => void;
  'game:loading-progress': (data: { loadedPlayerIds: string[]; totalPlayers: number }) => void;
  'debug:power-changed': (data: { power: PowerType }) => void; // TODO: remove after testing
  'ghost:death-screen': (data: { cause: string; killerId: string | null }) => void;
}

// ===== State Snapshot (sent at 20Hz) =====

export interface PlayerSnapshot {
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  isImpermeable: boolean;
  isElevated: boolean;
  speedMultiplier: number;
  lastProcessedInput: number;
  powerActive: boolean;
  powerCooldownEnd: number;
  mindControlTargetId: string | null;
  color: string;
  power: PowerType;
  health: number;
  maxHealth: number;
  damageSource: string;
  inShelter: boolean;
  doorProtection: boolean;
  isGhost: boolean;
  ghostPossessTargetId: string | null;
  powerUsesLeft: number;
  isUnderground: boolean;
  currentPipeNodeId: string | null;
}

export interface StateSnapshot {
  seq: number;
  timestamp: number;
  players: Record<string, PlayerSnapshot>;
  maze?: MazeSnapshot;
  currentEra?: string;
  eraGravity?: number;
  eraDescription?: string;
  shipOxygen?: number;             // 0-100 ship oxygen level
  oxygenRefillPlayerId?: string | null; // socketId of player currently refilling
  bodies?: Array<{ bodyId: string; victimId: string; victimColor: string; position: [number, number, number] }>;
}

export interface SerializedGameState {
  roomCode: string;
  phase: GamePhase;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  hostId: string;
}
