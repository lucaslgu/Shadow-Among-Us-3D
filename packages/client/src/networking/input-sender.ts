import type { Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, InputSnapshot } from '@shadow/shared';

const SEND_RATE = 20;
const SEND_INTERVAL = 1000 / SEND_RATE;

export class InputSender {
  private seq = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private socket: Socket<ServerEvents, ClientEvents>;
  private getKeys: () => { forward: boolean; backward: boolean; left: boolean; right: boolean };
  private getMouse: () => { x: number; y: number };
  private onLocalInput: (input: InputSnapshot) => void;

  constructor(
    socket: Socket<ServerEvents, ClientEvents>,
    getKeys: () => { forward: boolean; backward: boolean; left: boolean; right: boolean },
    getMouse: () => { x: number; y: number },
    onLocalInput: (input: InputSnapshot) => void,
  ) {
    this.socket = socket;
    this.getKeys = getKeys;
    this.getMouse = getMouse;
    this.onLocalInput = onLocalInput;
  }

  start() {
    this.intervalId = setInterval(() => {
      const keys = this.getKeys();
      const mouse = this.getMouse();

      this.seq++;
      const input: InputSnapshot = {
        seq: this.seq,
        forward: keys.forward,
        backward: keys.backward,
        left: keys.left,
        right: keys.right,
        mouseX: mouse.x,
        mouseY: mouse.y,
        timestamp: Date.now(),
      };

      this.socket.emit('player:input', input);
      this.onLocalInput(input);
    }, SEND_INTERVAL);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
