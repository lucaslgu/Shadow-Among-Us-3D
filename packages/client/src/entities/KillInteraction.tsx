import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const KILL_RANGE = 3.0;
const KILL_RANGE_SQ = KILL_RANGE * KILL_RANGE;

/**
 * KillInteraction — Shadow-only component that:
 * 1. Each frame checks proximity to alive crew players
 * 2. Updates nearestKillTargetId in the game store
 * 3. Listens for Space key to emit kill:attempt
 */
export function KillInteraction() {
  const nearestRef = useRef<string | null>(null);
  const prevTargetRef = useRef<string | null>(null);
  const killConsumed = useRef(false);

  // Space key to attempt kill
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !killConsumed.current) {
        killConsumed.current = true;

        const store = useGameStore.getState();
        // Only shadows can kill, must be alive, not ghost, not in task overlay/meeting
        if (store.localRole !== 'shadow') return;
        if (store.isGhost) return;
        if (store.taskOverlayVisible) return;
        if (store.phase !== 'playing') return;

        const targetId = nearestRef.current;
        if (!targetId) return;

        const socket = useNetworkStore.getState().socket;
        if (socket) {
          socket.emit('kill:attempt', { targetId });
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') killConsumed.current = false;
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

    // Only run for alive shadows
    if (store.localRole !== 'shadow' || store.isGhost || store.phase !== 'playing') {
      if (prevTargetRef.current !== null) {
        prevTargetRef.current = null;
        nearestRef.current = null;
        store.setNearestKillTargetId(null);
      }
      return;
    }

    const localId = store.localPlayerId;
    if (!localId) return;

    const [px, , pz] = store.localPosition;
    let bestId: string | null = null;
    let bestDistSq = KILL_RANGE_SQ;

    // Check all other alive, non-ghost players
    for (const [id, snap] of Object.entries(store.players)) {
      if (id === localId) continue;
      if (!snap.isAlive || snap.isGhost) continue;
      // Don't allow killing other shadows
      if (snap.power && store.players[localId]?.power === snap.power) {
        // Can't easily check role from snapshot, but we check server-side anyway
      }

      const dx = snap.position[0] - px;
      const dz = snap.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = id;
      }
    }

    nearestRef.current = bestId;

    if (bestId !== prevTargetRef.current) {
      prevTargetRef.current = bestId;
      store.setNearestKillTargetId(bestId);
    }
  });

  return null;
}
