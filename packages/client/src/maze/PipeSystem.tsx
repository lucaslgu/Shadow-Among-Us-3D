import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import type { PipeNode, PipeConnection } from '@shadow/shared';

/**
 * PipeSystem — renders realistic underground pipe tunnels that players
 * walk through, with industrial metal aesthetics, ribbed interiors,
 * and atmospheric lighting. Surface manholes mark entry/exit points.
 */

const PIPE_INTERACT_RANGE = 3.5;
const PIPE_INTERACT_RANGE_SQ = PIPE_INTERACT_RANGE * PIPE_INTERACT_RANGE;
const TUNNEL_RADIUS = 1.8;
const CHAMBER_RADIUS = 2.5;
const UNDERGROUND_Y = -10;
const PIPE_GLOW = '#00ff88';
const PIPE_GLOW_DIM = '#005533';

// Rib spacing along tunnels (units between ribs)
const RIB_SPACING = 2.5;
const RIB_INNER_RADIUS = TUNNEL_RADIUS - 0.02;
const RIB_OUTER_RADIUS = TUNNEL_RADIUS + 0.08;

// Module-level reusable objects
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

// ── Manhole covers on the surface ──

function PipeEntries({ nodes }: { nodes: PipeNode[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const grateRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    const ring = ringRef.current;
    const grate = grateRef.current;
    if (!mesh || !ring || !grate) return;

    for (let i = 0; i < nodes.length; i++) {
      const [x, , z] = nodes[i].surfacePosition;

      // Base circle
      _mat4.makeTranslation(x, 0.02, z);
      mesh.setMatrixAt(i, _mat4);

      // Glowing ring
      _mat4.makeTranslation(x, 0.04, z);
      ring.setMatrixAt(i, _mat4);

      // Grate pattern (rotated flat)
      _euler.set(-Math.PI / 2, 0, 0);
      _quat.setFromEuler(_euler);
      _mat4.compose(new THREE.Vector3(x, 0.03, z), _quat, new THREE.Vector3(1, 1, 1));
      grate.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    ring.instanceMatrix.needsUpdate = true;
    grate.instanceMatrix.needsUpdate = true;
  }, [nodes]);

  return (
    <>
      {/* Manhole cover base (dark metallic circle) */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <circleGeometry args={[1.3, 24]} />
        <meshStandardMaterial color="#080808" roughness={0.2} metalness={0.9} />
      </instancedMesh>

      {/* Glowing ring */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <ringGeometry args={[1.05, 1.3, 24]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
      </instancedMesh>

      {/* Inner grate pattern */}
      <instancedMesh ref={grateRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <ringGeometry args={[0.4, 1.0, 8]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.3} />
      </instancedMesh>
    </>
  );
}

// ── Pipe tunnel segment (connects two nodes) ──

function PipeTunnelSegment({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const { position, quaternion, length } = useMemo(() => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    const q = new THREE.Quaternion();
    const e = new THREE.Euler(Math.PI / 2, 0, -angle);
    q.setFromEuler(e);

    return {
      position: new THREE.Vector3((from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2),
      quaternion: q,
      length: len,
    };
  }, [from, to]);

  return (
    <group position={position} quaternion={quaternion}>
      {/* Main pipe tube (player walks inside) */}
      <mesh>
        <cylinderGeometry args={[TUNNEL_RADIUS, TUNNEL_RADIUS, length, 16, 1, true]} />
        <meshStandardMaterial
          color="#2a2a28"
          roughness={0.35}
          metalness={0.75}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer pipe shell (visible from outside) */}
      <mesh>
        <cylinderGeometry args={[TUNNEL_RADIUS + 0.1, TUNNEL_RADIUS + 0.1, length, 12, 1, true]} />
        <meshStandardMaterial
          color="#1a1a18"
          roughness={0.4}
          metalness={0.8}
        />
      </mesh>

      {/* Floor grate (flat walkable surface inside the pipe) */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <planeGeometry args={[length, TUNNEL_RADIUS * 1.4]} />
        <meshStandardMaterial
          color="#1a1c1a"
          roughness={0.6}
          metalness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ── Reinforcement ribs (instanced across all tunnel segments) ──

function TunnelRibs({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const ribRef = useRef<THREE.InstancedMesh>(null);

  const ribCount = useMemo(() => {
    const nodeMap = new Map<string, PipeNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    let count = 0;
    for (const conn of connections) {
      const a = nodeMap.get(conn.nodeA);
      const b = nodeMap.get(conn.nodeB);
      if (!a || !b) continue;
      const dx = b.undergroundPosition[0] - a.undergroundPosition[0];
      const dz = b.undergroundPosition[2] - a.undergroundPosition[2];
      const len = Math.sqrt(dx * dx + dz * dz);
      count += Math.max(1, Math.floor(len / RIB_SPACING));
    }
    return count;
  }, [nodes, connections]);

  useEffect(() => {
    const mesh = ribRef.current;
    if (!mesh) return;

    const nodeMap = new Map<string, PipeNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    let idx = 0;
    for (const conn of connections) {
      const a = nodeMap.get(conn.nodeA);
      const b = nodeMap.get(conn.nodeB);
      if (!a || !b) continue;

      const ax = a.undergroundPosition[0], az = a.undergroundPosition[2];
      const bx = b.undergroundPosition[0], bz = b.undergroundPosition[2];
      const dx = bx - ax, dz = bz - az;
      const len = Math.sqrt(dx * dx + dz * dz);
      const dirX = dx / len, dirZ = dz / len;
      const angle = Math.atan2(dx, dz);
      const ribsInSegment = Math.max(1, Math.floor(len / RIB_SPACING));

      for (let r = 0; r < ribsInSegment; r++) {
        const t = (r + 0.5) / ribsInSegment;
        const px = ax + dirX * len * t;
        const pz = az + dirZ * len * t;

        _euler.set(Math.PI / 2, 0, -angle);
        _quat.setFromEuler(_euler);
        _mat4.compose(
          new THREE.Vector3(px, UNDERGROUND_Y, pz),
          _quat,
          new THREE.Vector3(1, 1, 1),
        );
        mesh.setMatrixAt(idx++, _mat4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [nodes, connections]);

  if (ribCount === 0) return null;

  return (
    <instancedMesh ref={ribRef} args={[undefined, undefined, ribCount]} frustumCulled={false}>
      <torusGeometry args={[RIB_INNER_RADIUS + (RIB_OUTER_RADIUS - RIB_INNER_RADIUS) / 2, (RIB_OUTER_RADIUS - RIB_INNER_RADIUS) / 2, 6, 16]} />
      <meshStandardMaterial
        color="#3a3530"
        roughness={0.3}
        metalness={0.85}
      />
    </instancedMesh>
  );
}

// ── Tunnel lights (instanced along connections) ──

function TunnelLights({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const lightFixtureRef = useRef<THREE.InstancedMesh>(null);

  const lightData = useMemo(() => {
    const nodeMap = new Map<string, PipeNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const positions: Array<[number, number, number]> = [];
    for (const conn of connections) {
      const a = nodeMap.get(conn.nodeA);
      const b = nodeMap.get(conn.nodeB);
      if (!a || !b) continue;

      const ax = a.undergroundPosition[0], az = a.undergroundPosition[2];
      const bx = b.undergroundPosition[0], bz = b.undergroundPosition[2];
      const dx = bx - ax, dz = bz - az;
      const len = Math.sqrt(dx * dx + dz * dz);

      // One light every ~6 units along the tunnel
      const lightCount = Math.max(1, Math.round(len / 6));
      for (let i = 0; i < lightCount; i++) {
        const t = (i + 0.5) / lightCount;
        positions.push([
          ax + dx * t,
          UNDERGROUND_Y + TUNNEL_RADIUS * 0.7,
          az + dz * t,
        ]);
      }
    }
    return positions;
  }, [nodes, connections]);

  useEffect(() => {
    const mesh = lightFixtureRef.current;
    if (!mesh) return;

    for (let i = 0; i < lightData.length; i++) {
      _mat4.makeTranslation(lightData[i][0], lightData[i][1], lightData[i][2]);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [lightData]);

  if (lightData.length === 0) return null;

  return (
    <>
      {/* Light fixture geometry */}
      <instancedMesh ref={lightFixtureRef} args={[undefined, undefined, lightData.length]} frustumCulled={false}>
        <boxGeometry args={[0.3, 0.08, 0.15]} />
        <meshBasicMaterial color={PIPE_GLOW_DIM} />
      </instancedMesh>

      {/* Actual point lights (only place a few for performance) */}
      {lightData.filter((_, i) => i % 2 === 0).map((pos, i) => (
        <pointLight
          key={`tl_${i}`}
          position={pos}
          color="#0a3320"
          intensity={0.8}
          distance={8}
        />
      ))}
    </>
  );
}

// ── Node chambers (junction rooms at each pipe node) ──

function NodeChamber({ node }: { node: PipeNode }) {
  const [x, y, z] = node.undergroundPosition;

  return (
    <group position={[x, y, z]}>
      {/* Chamber dome (larger cylindrical room) */}
      <mesh>
        <cylinderGeometry args={[CHAMBER_RADIUS, CHAMBER_RADIUS, TUNNEL_RADIUS * 2, 20, 1, true]} />
        <meshStandardMaterial
          color="#2a2a28"
          roughness={0.35}
          metalness={0.75}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Chamber ceiling cap */}
      <mesh position={[0, TUNNEL_RADIUS, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[CHAMBER_RADIUS, 20]} />
        <meshStandardMaterial
          color="#222220"
          roughness={0.4}
          metalness={0.7}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Chamber floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -TUNNEL_RADIUS + 0.01, 0]}>
        <circleGeometry args={[CHAMBER_RADIUS, 20]} />
        <meshStandardMaterial color="#1a1c1a" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* Vertical exit shaft (pipe going up to the surface) */}
      <mesh position={[0, TUNNEL_RADIUS + 1.5, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 3, 12, 1, true]} />
        <meshStandardMaterial
          color="#2a2a28"
          roughness={0.35}
          metalness={0.75}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Ladder rungs inside the shaft */}
      {[0.5, 1.0, 1.5, 2.0, 2.5].map((ly, i) => (
        <mesh key={`rung_${i}`} position={[0, TUNNEL_RADIUS + ly, 0.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
          <meshStandardMaterial color="#666655" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Glow from the surface (light at top of shaft) */}
      <pointLight
        position={[0, TUNNEL_RADIUS + 3, 0]}
        color={PIPE_GLOW}
        intensity={1.5}
        distance={6}
      />

      {/* Green marker light on floor (indicates exit point) */}
      <mesh position={[0, -TUNNEL_RADIUS + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.7, 12]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.4} />
      </mesh>

      {/* Chamber ambient light */}
      <pointLight
        position={[0, 0.5, 0]}
        color="#0a3320"
        intensity={1.5}
        distance={6}
      />

      {/* Reinforcement ring at chamber top */}
      <mesh position={[0, TUNNEL_RADIUS - 0.1, 0]}>
        <torusGeometry args={[CHAMBER_RADIUS, 0.08, 6, 20]} />
        <meshStandardMaterial color="#3a3530" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* Reinforcement ring at chamber bottom */}
      <mesh position={[0, -TUNNEL_RADIUS + 0.1, 0]}>
        <torusGeometry args={[CHAMBER_RADIUS, 0.08, 6, 20]} />
        <meshStandardMaterial color="#3a3530" roughness={0.3} metalness={0.85} />
      </mesh>
    </group>
  );
}

// ── Underground tunnels composite ──

function UndergroundTunnels({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, PipeNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  return (
    <group>
      {/* Ambient underground light (very dim) */}
      <ambientLight intensity={0.05} color="#0a2a15" />

      {/* Tunnel tube segments */}
      {connections.map((conn, i) => {
        const a = nodeMap.get(conn.nodeA);
        const b = nodeMap.get(conn.nodeB);
        if (!a || !b) return null;
        return <PipeTunnelSegment key={i} from={a.undergroundPosition} to={b.undergroundPosition} />;
      })}

      {/* Reinforcement ribs along all tunnels */}
      <TunnelRibs nodes={nodes} connections={connections} />

      {/* Tunnel lights */}
      <TunnelLights nodes={nodes} connections={connections} />

      {/* Node chambers */}
      {nodes.map((node) => (
        <NodeChamber key={node.id} node={node} />
      ))}
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
        background: 'rgba(0, 15, 8, 0.92)',
        border: `2px solid ${PIPE_GLOW}`,
        borderRadius: 10,
        padding: '8px 16px',
        textAlign: 'center',
        fontFamily: "'Courier New', monospace",
        color: PIPE_GLOW,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 15px rgba(0, 255, 136, 0.2)`,
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
          <span>{nearestPipe.isUnderground ? 'Climb up' : 'Enter pipe'}</span>
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
