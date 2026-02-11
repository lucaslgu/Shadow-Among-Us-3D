import { PowerType } from './powers.js';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type PlayerRole = 'crew' | 'shadow';

export interface PlayerState {
  id: string;
  name: string;
  position: Vec3;
  rotation: Quat;
  color: string;
  role: PlayerRole;
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  hasShield: boolean;
  speedMultiplier: number;
  power: PowerType | null;
  powerCooldownEnd: number;
  powerActiveEnd: number;
}

export interface InputSnapshot {
  seq: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  mouseX: number;
  mouseY: number;
  timestamp: number;
}
