import { useEffect, useRef, useCallback } from 'react';
import { mouseState } from '../networking/mouse-state.js';

export interface InputRefs {
  keysRef: React.MutableRefObject<{ forward: boolean; backward: boolean; left: boolean; right: boolean }>;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  arrowKeysRef: React.MutableRefObject<{ forward: boolean; backward: boolean; left: boolean; right: boolean }>;
  actionRef: React.MutableRefObject<{ power: boolean; powerConsumed: boolean }>;
}

export function useInput(): InputRefs {
  const keysRef = useRef({ forward: false, backward: false, left: false, right: false });
  const mouseRef = useRef({ x: 0, y: 0 });
  // Arrow keys for Mind Controller dual-control
  const arrowKeysRef = useRef({ forward: false, backward: false, left: false, right: false });
  // Action keys
  const actionRef = useRef({ power: false, powerConsumed: false });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Suppress game input when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.code) {
        // WASD movement
        case 'KeyW': keysRef.current.forward = true; break;
        case 'KeyS': keysRef.current.backward = true; break;
        case 'KeyA': keysRef.current.left = true; break;
        case 'KeyD': keysRef.current.right = true; break;
        // Arrow keys (Mind Controller target control)
        case 'ArrowUp': arrowKeysRef.current.forward = true; break;
        case 'ArrowDown': arrowKeysRef.current.backward = true; break;
        case 'ArrowLeft': arrowKeysRef.current.left = true; break;
        case 'ArrowRight': arrowKeysRef.current.right = true; break;
        // Power activation (Q)
        case 'KeyQ':
          if (!actionRef.current.powerConsumed) {
            actionRef.current.power = true;
            actionRef.current.powerConsumed = true;
          }
          break;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      switch (e.code) {
        case 'KeyW': keysRef.current.forward = false; break;
        case 'KeyS': keysRef.current.backward = false; break;
        case 'KeyA': keysRef.current.left = false; break;
        case 'KeyD': keysRef.current.right = false; break;
        case 'ArrowUp': arrowKeysRef.current.forward = false; break;
        case 'ArrowDown': arrowKeysRef.current.backward = false; break;
        case 'ArrowLeft': arrowKeysRef.current.left = false; break;
        case 'ArrowRight': arrowKeysRef.current.right = false; break;
        case 'KeyQ':
          actionRef.current.powerConsumed = false;
          break;
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (document.pointerLockElement) {
        mouseRef.current.x += e.movementX * 0.002;
        mouseRef.current.y = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, mouseRef.current.y + e.movementY * 0.002),
        );
        // Update shared state for the camera to read every frame
        mouseState.yaw = mouseRef.current.x;
        mouseState.pitch = mouseRef.current.y;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return { keysRef, mouseRef, arrowKeysRef, actionRef };
}
