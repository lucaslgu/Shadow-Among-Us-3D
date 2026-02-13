import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const BODY_INTERACT_RANGE_SQ = 2.5 * 2.5;

export function BodyInteraction() {
  const nearestRef = useRef<string | null>(null);
  const prevNearestRef = useRef<string | null>(null);
  const interactConsumed = useRef(false);

  // R key to report body
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyR' && !interactConsumed.current) {
        interactConsumed.current = true;

        const bodyId = nearestRef.current;
        if (!bodyId) return;

        const store = useGameStore.getState();
        if (store.isGhost) return;
        if (store.phase !== 'playing') return;
        if (store.taskOverlayVisible) return;

        const socket = useNetworkStore.getState().socket;
        if (!socket) return;

        socket.emit('body:report', { bodyId });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyR') interactConsumed.current = false;
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
    const store = useGameStore.getState();
    if (store.isGhost) {
      if (prevNearestRef.current !== null) {
        prevNearestRef.current = null;
        nearestRef.current = null;
        store.setNearestBodyId(null);
      }
      return;
    }

    const bodies = store.bodies;
    if (bodies.length === 0) {
      if (prevNearestRef.current !== null) {
        prevNearestRef.current = null;
        nearestRef.current = null;
        store.setNearestBodyId(null);
      }
      return;
    }

    const [px, , pz] = store.localPosition;
    let bestId: string | null = null;
    let bestDistSq = BODY_INTERACT_RANGE_SQ;

    for (const body of bodies) {
      const dx = body.position[0] - px;
      const dz = body.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = body.bodyId;
      }
    }

    nearestRef.current = bestId;

    if (bestId !== prevNearestRef.current) {
      prevNearestRef.current = bestId;
      store.setNearestBodyId(bestId);
    }
  });

  return null;
}
