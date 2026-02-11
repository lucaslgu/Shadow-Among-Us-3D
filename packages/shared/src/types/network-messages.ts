import type { GamePhase, GameSettings } from './game-state.js';
import type { InputSnapshot, PlayerState, Vec3 } from './player.js';
import type { PowerType } from './powers.js';

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
  'player:input': (data: InputSnapshot) => void;
  'player:interact': (data: { targetId: string }) => void;
  'rooms:list': (data: { page: number; limit: number }) => void;
  'game:start': () => void;
  'power:activate': (data: { targetId?: string; locationId?: string }) => void;
  'power:deactivate': () => void;
  'mind-control:input': (data: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number }) => void;
  'kill:attempt': (data: { targetId: string }) => void;
  'body:report': (data: { bodyId: string }) => void;
  'meeting:emergency': () => void;
  'vote:cast': (data: { targetId: string | null }) => void;
  'chat:message': (data: { text: string }) => void;
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
  'game:started': (data: { role: string; power: PowerType; playerInfo: Record<string, { name: string; color: string }> }) => void;
  'game:state-snapshot': (data: StateSnapshot) => void;
  'game:phase-change': (data: { phase: GamePhase }) => void;
  'power:activated': (data: { playerId: string; powerType: PowerType; targetId?: string }) => void;
  'power:ended': (data: { playerId: string; powerType: PowerType }) => void;
  'kill:occurred': (data: { killerId: string; victimId: string; bodyPosition: Vec3 }) => void;
  'meeting:started': (data: { reporterId: string; bodyId?: string }) => void;
  'vote:result': (data: { ejectedId: string | null; votes: Record<string, string | null> }) => void;
  'game:over': (data: { winner: 'crew' | 'shadow'; roles: Record<string, string> }) => void;
  'chat:message': (data: { playerId: string; text: string }) => void;
}

// ===== State Snapshot (sent at 20Hz) =====

export interface PlayerSnapshot {
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  speedMultiplier: number;
  lastProcessedInput: number;
  powerActive: boolean;
  powerCooldownEnd: number;
  mindControlTargetId: string | null;
  color: string;
}

export interface StateSnapshot {
  seq: number;
  timestamp: number;
  players: Record<string, PlayerSnapshot>;
}

export interface SerializedGameState {
  roomCode: string;
  phase: GamePhase;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  hostId: string;
}
