import type { InputSnapshot } from '@shadow/shared';
import { applyMovement, yawToQuaternion } from '@shadow/shared';

export interface MovablePlayer {
  position: [number, number, number];
  rotation: [number, number, number, number];
  speedMultiplier: number;
  lastProcessedInput: number;
}

export function processInput(player: MovablePlayer, input: InputSnapshot, dt: number): void {
  if (input.seq <= player.lastProcessedInput) return;

  player.position = applyMovement(player.position, input, dt, player.speedMultiplier);
  player.rotation = yawToQuaternion(input.mouseX);
  player.lastProcessedInput = input.seq;
}
