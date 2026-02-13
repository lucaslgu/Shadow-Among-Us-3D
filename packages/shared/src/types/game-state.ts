import type { PlayerState } from './player.js';

export type GamePhase = 'lobby' | 'loading' | 'playing' | 'meeting' | 'results';

export interface GameSettings {
  maxPlayers: number;
  shadowCount: number;
  discussionTime: number;
  votingTime: number;
  killCooldown: number;
  playerSpeed: number;
  flashlightRange: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  maxPlayers: 10,
  shadowCount: 2,
  discussionTime: 30000,
  votingTime: 30000,
  killCooldown: 25000,
  playerSpeed: 5,
  flashlightRange: 80,
};

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  hostId: string;
  tick: number;
}
