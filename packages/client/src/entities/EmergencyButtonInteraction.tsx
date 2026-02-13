import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const EMERGENCY_RANGE_SQ = 3.5 * 3.5;
const BUTTON_POS: [number, number, number] = [0, 0, 0];

export function EmergencyButtonInteraction() {
  const nearRef = useRef(false);
  const prevNearRef = useRef(false);
  const interactConsumed = useRef(false);

  // E key to trigger emergency meeting
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyE' && !interactConsumed.current) {
        interactConsumed.current = true;

        if (!nearRef.current) return;

        const store = useGameStore.getState();
        // Don't fire if task overlay is open or there's a nearby task to interact with
        if (store.taskOverlayVisible) return;
        if (store.nearestInteractTask && store.nearestInteractTask.state !== 'completed' && !store.nearestInteractTask.isBusy) return;
        // Don't fire during meeting
        if (store.phase === 'meeting') return;
        // Ghost can't call meetings
        if (store.isGhost) return;

        const socket = useNetworkStore.getState().socket;
        if (!socket) return;

        socket.emit('meeting:emergency');
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyE') interactConsumed.current = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Proximity check each frame
  useFrame(() => {
    const [px, , pz] = useGameStore.getState().localPosition;
    const dx = BUTTON_POS[0] - px;
    const dz = BUTTON_POS[2] - pz;
    const distSq = dx * dx + dz * dz;

    const isNear = distSq < EMERGENCY_RANGE_SQ;
    nearRef.current = isNear;

    if (isNear !== prevNearRef.current) {
      prevNearRef.current = isNear;
      useGameStore.getState().setNearEmergencyButton(isNear);
    }
  });

  return null;
}
