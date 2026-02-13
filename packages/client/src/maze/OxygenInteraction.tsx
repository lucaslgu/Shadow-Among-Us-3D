import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OxygenGeneratorInfo } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const OXYGEN_INTERACT_RANGE_SQ = 3.5 * 3.5;
const REFILL_DURATION_MS = 5000;

export function OxygenInteraction() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const shipOxygen = useGameStore((s) => s.shipOxygen);
  const oxygenRefillPlayerId = useGameStore((s) => s.oxygenRefillPlayerId);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const taskOverlayVisible = useGameStore((s) => s.taskOverlayVisible);

  const nearestGenRef = useRef<OxygenGeneratorInfo | null>(null);
  const prevGenIdRef = useRef<string | null>(null);
  const refillStartRef = useRef<number>(0);
  const interactConsumed = useRef(false);

  const [nearbyGen, setNearbyGen] = useState<OxygenGeneratorInfo | null>(null);
  const [refillProgress, setRefillProgress] = useState(0);

  const isRefilling = oxygenRefillPlayerId === localPlayerId;
  const someoneElseRefilling = !!oxygenRefillPlayerId && oxygenRefillPlayerId !== localPlayerId;

  // G key to start/cancel oxygen refill (avoids conflict with E for tasks/doors)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyG' && !interactConsumed.current) {
        interactConsumed.current = true;

        if (taskOverlayVisible) return;

        const gen = nearestGenRef.current;
        if (!gen) return;

        const socket = useNetworkStore.getState().socket;
        if (!socket) return;

        const currentOxygen = useGameStore.getState().shipOxygen;
        const currentRefillPlayer = useGameStore.getState().oxygenRefillPlayerId;
        const myId = useGameStore.getState().localPlayerId;

        // Toggle: if already refilling, cancel
        if (currentRefillPlayer === myId) {
          socket.emit('oxygen:cancel-refill');
          refillStartRef.current = 0;
          setRefillProgress(0);
          return;
        }

        // Don't start if oxygen is already full or someone else is refilling
        if (currentOxygen >= 100) return;
        if (currentRefillPlayer && currentRefillPlayer !== myId) return;

        socket.emit('oxygen:start-refill', { generatorId: gen.id });
        refillStartRef.current = Date.now();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyG') interactConsumed.current = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [taskOverlayVisible]);

  // Proximity check each frame
  useFrame(() => {
    const generators = mazeLayout?.oxygenGenerators;
    if (!generators || generators.length === 0) {
      nearestGenRef.current = null;
      if (prevGenIdRef.current !== null) {
        prevGenIdRef.current = null;
        setNearbyGen(null);
      }
      return;
    }

    const [px, , pz] = useGameStore.getState().localPosition;
    let best: OxygenGeneratorInfo | null = null;
    let bestDistSq = OXYGEN_INTERACT_RANGE_SQ;

    for (const gen of generators) {
      const dx = gen.position[0] - px;
      const dz = gen.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = gen;
      }
    }

    nearestGenRef.current = best;

    const newId = best?.id ?? null;
    if (newId !== prevGenIdRef.current) {
      prevGenIdRef.current = newId;
      setNearbyGen(best);

      // Auto-cancel refill if walked away from generator
      if (!best && isRefilling) {
        const socket = useNetworkStore.getState().socket;
        if (socket) socket.emit('oxygen:cancel-refill');
        refillStartRef.current = 0;
        setRefillProgress(0);
      }
    }

    // Update refill progress
    if (isRefilling && refillStartRef.current > 0) {
      const elapsed = Date.now() - refillStartRef.current;
      const pct = Math.min(1, elapsed / REFILL_DURATION_MS);
      setRefillProgress(pct);

      if (pct >= 1) {
        refillStartRef.current = 0;
        setRefillProgress(0);
      }
    } else if (!isRefilling && refillProgress > 0) {
      setRefillProgress(0);
      refillStartRef.current = 0;
    }
  });

  if (!nearbyGen) return null;

  const oxyFull = shipOxygen >= 100;
  const borderColor = isRefilling ? '#4ade80' : someoneElseRefilling ? '#fbbf24' : oxyFull ? '#6b6b8a' : '#44aaff';

  return (
    <group position={[nearbyGen.position[0], 2.6, nearbyGen.position[2]]}>
      <Html center distanceFactor={8} zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.85)',
            border: `2px solid ${borderColor}`,
            borderRadius: 10,
            padding: '8px 16px',
            color: '#ffffff',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: 14,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#44aaff' }}>
            Gerador O{'\u2082'} ({nearbyGen.roomName})
          </div>

          {isRefilling ? (
            <div>
              <div style={{
                width: '100%',
                height: 6,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 3,
                overflow: 'hidden',
                marginBottom: 4,
              }}>
                <div style={{
                  width: `${Math.round(refillProgress * 100)}%`,
                  height: '100%',
                  background: '#4ade80',
                  borderRadius: 3,
                  transition: 'width 0.1s linear',
                }} />
              </div>
              <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
                Repondo... [G] cancelar
              </div>
            </div>
          ) : someoneElseRefilling ? (
            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>
              Algu{'\u00E9'}m est{'\u00E1'} repondo...
            </div>
          ) : oxyFull ? (
            <div style={{ fontSize: 12, color: '#6b6b8a' }}>
              Oxig{'\u00EA'}nio cheio
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  background: '#44aaff',
                  color: '#000',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                G
              </span>
              <span style={{ fontSize: 13, color: '#aabbdd', fontWeight: 600 }}>
                Repor Oxig{'\u00EA'}nio
              </span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
