import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import type { PipeNode, PipeConnection } from '@shadow/shared';

/**
 * PipeSystem — renders pipe entry manholes on the surface, underground tunnel geometry,
 * and handles enter/exit interaction when player presses E near a pipe.
 */

const PIPE_INTERACT_RANGE = 3.5;
const PIPE_INTERACT_RANGE_SQ = PIPE_INTERACT_RANGE * PIPE_INTERACT_RANGE;
const TUNNEL_RADIUS = 1.8;
const TUNNEL_COLOR = '#1a2a1a';
const PIPE_GLOW = '#00ff88';

// Module-level reusable objects
const _pos = new THREE.Vector3();

// ── Manhole covers on the surface ──

function PipeEntries({ nodes }: { nodes: PipeNode[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    const ring = ringRef.current;
    if (!mesh || !ring) return;

    for (let i = 0; i < nodes.length; i++) {
      const [x, , z] = nodes[i].surfacePosition;
      matrix.makeTranslation(x, 0.02, z);
      mesh.setMatrixAt(i, matrix);

      // Ring slightly above
      matrix.makeTranslation(x, 0.04, z);
      ring.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    ring.instanceMatrix.needsUpdate = true;
  }, [nodes, matrix]);

  return (
    <>
      {/* Manhole cover base (dark circle on floor) */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <circleGeometry args={[1.2, 24]} />
        <meshStandardMaterial
          color="#0a0a0a"
          roughness={0.3}
          metalness={0.8}
          rotation-x={-Math.PI / 2}
        />
      </instancedMesh>

      {/* Glowing ring */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <ringGeometry args={[1.0, 1.25, 24]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.6} />
      </instancedMesh>
    </>
  );
}

// ── Underground tunnel segments ──

function TunnelSegment({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);

  const { position, rotation, length } = useMemo(() => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    return {
      position: [(from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2] as [number, number, number],
      rotation: [Math.PI / 2, 0, -angle] as [number, number, number],
      length: len,
    };
  }, [from, to]);

  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <cylinderGeometry args={[TUNNEL_RADIUS, TUNNEL_RADIUS, length, 12, 1, true]} />
      <meshStandardMaterial
        color={TUNNEL_COLOR}
        roughness={0.7}
        metalness={0.4}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function UndergroundTunnels({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, PipeNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  return (
    <group>
      {/* Tunnel floor (flat plane at underground level) */}
      <mesh position={[0, -10.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#0a120a" roughness={0.8} metalness={0.3} />
      </mesh>

      {/* Tunnel ceiling */}
      <mesh position={[0, -10 + TUNNEL_RADIUS * 0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#080e08" roughness={0.9} metalness={0.2} side={THREE.BackSide} />
      </mesh>

      {/* Tunnel tube segments */}
      {connections.map((conn, i) => {
        const a = nodeMap.get(conn.nodeA);
        const b = nodeMap.get(conn.nodeB);
        if (!a || !b) return null;
        return <TunnelSegment key={i} from={a.undergroundPosition} to={b.undergroundPosition} />;
      })}

      {/* Node chambers (enlarged areas at each pipe node) */}
      {nodes.map((node) => (
        <group key={node.id} position={node.undergroundPosition}>
          {/* Chamber sphere */}
          <mesh>
            <sphereGeometry args={[2.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={TUNNEL_COLOR}
              roughness={0.6}
              metalness={0.5}
              side={THREE.BackSide}
            />
          </mesh>
          {/* Floor disc */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <circleGeometry args={[2.5, 16]} />
            <meshStandardMaterial color="#0d1a0d" roughness={0.7} metalness={0.4} />
          </mesh>
          {/* Glow marker for exit */}
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 1, 8]} />
            <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.5} />
          </mesh>
          {/* Dim point light */}
          <pointLight color={PIPE_GLOW} intensity={2} distance={8} />
        </group>
      ))}

      {/* Pipe lights along tunnels */}
      {connections.map((conn, i) => {
        const a = nodeMap.get(conn.nodeA);
        const b = nodeMap.get(conn.nodeB);
        if (!a || !b) return null;
        const midX = (a.undergroundPosition[0] + b.undergroundPosition[0]) / 2;
        const midZ = (a.undergroundPosition[2] + b.undergroundPosition[2]) / 2;
        return (
          <pointLight
            key={`light_${i}`}
            position={[midX, -10 + TUNNEL_RADIUS * 0.6, midZ]}
            color="#224422"
            intensity={1}
            distance={12}
          />
        );
      })}
    </group>
  );
}

// ── Pipe Interaction (E to enter/exit) ──

function PipeInteraction({ nodes }: { nodes: PipeNode[] }) {
  const [nearestPipe, setNearestPipe] = useState<{ node: PipeNode; isUnderground: boolean } | null>(null);

  useFrame(() => {
    const { localPlayerId, players, localPosition } = useGameStore.getState();
    if (!localPlayerId) return;
    const mySnap = players[localPlayerId];
    if (!mySnap || !mySnap.isAlive) { setNearestPipe(null); return; }

    const isUnderground = mySnap.isUnderground;
    const [px, , pz] = localPosition;

    let nearest: PipeNode | null = null;
    let nearestDistSq = PIPE_INTERACT_RANGE_SQ;

    for (const node of nodes) {
      const target = isUnderground ? node.undergroundPosition : node.surfacePosition;
      const dx = px - target[0];
      const dz = pz - target[2];
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = node;
      }
    }

    if (nearest) {
      setNearestPipe({ node: nearest, isUnderground });
    } else {
      setNearestPipe(null);
    }
  });

  // Listen for E key to enter/exit pipe
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code !== 'KeyE') return;

      const gameStore = useGameStore.getState();
      // Don't interact with pipes while doing tasks or other overlays
      if (gameStore.taskOverlayVisible || gameStore.targetingMode || gameStore.teleportMapOpen || gameStore.hackerPanelOpen) return;

      if (!nearestPipe) return;
      const socket = useNetworkStore.getState().socket;
      if (!socket) return;

      if (nearestPipe.isUnderground) {
        socket.emit('pipe:exit', { pipeNodeId: nearestPipe.node.id });
      } else {
        socket.emit('pipe:enter', { pipeNodeId: nearestPipe.node.id });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nearestPipe]);

  if (!nearestPipe) return null;

  const target = nearestPipe.isUnderground
    ? nearestPipe.node.undergroundPosition
    : nearestPipe.node.surfacePosition;

  return (
    <Html position={[target[0], target[1] + 2, target[2]]} center>
      <div style={{
        background: 'rgba(0, 20, 10, 0.9)',
        border: `2px solid ${PIPE_GLOW}`,
        borderRadius: 10,
        padding: '8px 16px',
        textAlign: 'center',
        fontFamily: "'Courier New', monospace",
        color: PIPE_GLOW,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {nearestPipe.isUnderground
            ? `EXIT: ${nearestPipe.node.roomName}`
            : `PIPE: ${nearestPipe.node.roomName}`}
        </div>
        <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{
            background: PIPE_GLOW,
            color: '#000',
            borderRadius: 3,
            padding: '1px 6px',
            fontWeight: 'bold',
            fontSize: 11,
          }}>E</span>
          <span>{nearestPipe.isUnderground ? 'Go up' : 'Go down'}</span>
        </div>
      </div>
    </Html>
  );
}

// ── Main Export ──

export function PipeSystem() {
  const mazeLayout = useGameStore((st) => st.mazeLayout);

  const pipeNodes = mazeLayout?.pipeNodes;
  const pipeConnections = mazeLayout?.pipeConnections;

  if (!pipeNodes || pipeNodes.length === 0 || !pipeConnections) return null;

  return (
    <>
      <PipeEntries nodes={pipeNodes} />
      <UndergroundTunnels nodes={pipeNodes} connections={pipeConnections} />
      <PipeInteraction nodes={pipeNodes} />
    </>
  );
}
