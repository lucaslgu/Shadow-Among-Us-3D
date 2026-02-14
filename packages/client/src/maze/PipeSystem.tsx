import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import type { PipeNode, PipeConnection, PipeWall } from '@shadow/shared';

/**
 * PipeSystem — renders underground industrial tunnels with concrete walls,
 * ceiling pipes, and atmospheric lighting. Players walk through wide
 * rectangular corridors connecting rooms via manholes on the surface.
 */

const PIPE_INTERACT_RANGE = 3.5;
const PIPE_INTERACT_RANGE_SQ = PIPE_INTERACT_RANGE * PIPE_INTERACT_RANGE;
const TUNNEL_RADIUS = 3.0;     // half-width of corridor (collision match)
const TUNNEL_HEIGHT = 5.0;     // floor to ceiling
const UNDERGROUND_Y = -10;
const PIPE_GLOW = '#00ff88';
const PIPE_GLOW_DIM = '#005533';

// Beam spacing along tunnels
const BEAM_SPACING = 3.0;

// Module-level reusable objects
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

// ── Manhole covers on the surface ──

function PipeEntries({ nodes }: { nodes: PipeNode[] }) {
  const coverRef = useRef<THREE.InstancedMesh>(null);
  const rimRef = useRef<THREE.InstancedMesh>(null);
  const indicatorRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const cover = coverRef.current;
    const rim = rimRef.current;
    const indicator = indicatorRef.current;
    if (!cover || !rim || !indicator) return;

    for (let i = 0; i < nodes.length; i++) {
      const [x, , z] = nodes[i].surfacePosition;

      _euler.set(-Math.PI / 2, 0, 0);
      _quat.setFromEuler(_euler);
      _pos.set(x, 0.03, z);
      _mat4.compose(_pos, _quat, _one);
      cover.setMatrixAt(i, _mat4);

      _pos.set(x, 0.05, z);
      _mat4.compose(_pos, _quat, _one);
      rim.setMatrixAt(i, _mat4);

      _pos.set(x, 0.06, z);
      _mat4.compose(_pos, _quat, _one);
      indicator.setMatrixAt(i, _mat4);
    }
    cover.instanceMatrix.needsUpdate = true;
    rim.instanceMatrix.needsUpdate = true;
    indicator.instanceMatrix.needsUpdate = true;
  }, [nodes]);

  return (
    <>
      <instancedMesh ref={coverRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <circleGeometry args={[1.2, 24]} />
        <meshStandardMaterial color="#252520" roughness={0.35} metalness={0.85} />
      </instancedMesh>
      <instancedMesh ref={rimRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <ringGeometry args={[1.15, 1.35, 24]} />
        <meshStandardMaterial color="#3a3a30" roughness={0.25} metalness={0.9} />
      </instancedMesh>
      <instancedMesh ref={indicatorRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <ringGeometry args={[0.15, 0.25, 12]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.5} />
      </instancedMesh>
    </>
  );
}

// ── Tunnel walls rendered directly from collision data (single source of truth) ──

const PIPE_WALL_THICKNESS = 0.3;

function PipeTunnelWalls({ pipeWalls }: { pipeWalls: PipeWall[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || pipeWalls.length === 0) return;

    for (let i = 0; i < pipeWalls.length; i++) {
      const wall = pipeWalls[i];
      const [x1, z1] = wall.start;
      const [x2, z2] = wall.end;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) continue;

      const angle = Math.atan2(dx, dz);
      const midX = (x1 + x2) / 2;
      const midZ = (z1 + z2) / 2;

      _euler.set(0, angle, 0);
      _quat.setFromEuler(_euler);
      _pos.set(midX, UNDERGROUND_Y + TUNNEL_HEIGHT / 2, midZ);
      _one.set(PIPE_WALL_THICKNESS, TUNNEL_HEIGHT, length);
      _mat4.compose(_pos, _quat, _one);
      mesh.setMatrixAt(i, _mat4);
    }
    _one.set(1, 1, 1);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pipeWalls]);

  if (pipeWalls.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, pipeWalls.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#22252e"
        roughness={0.35}
        metalness={0.75}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

// ── Tunnel ceilings (instanced per connection) ──

function TunnelCeilings({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const ceilingData = useMemo(() => {
    const nodeMap = new Map<string, PipeNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const R = TUNNEL_RADIUS;
    const result: Array<{ midX: number; midZ: number; angle: number; length: number }> = [];

    for (const conn of connections) {
      const a = nodeMap.get(conn.nodeA);
      const b = nodeMap.get(conn.nodeB);
      if (!a || !b) continue;

      const ax = a.undergroundPosition[0], az = a.undergroundPosition[2];
      const bx = b.undergroundPosition[0], bz = b.undergroundPosition[2];
      const dx = bx - ax, dz = bz - az;
      const fullLen = Math.sqrt(dx * dx + dz * dz);
      if (fullLen < R * 2.5) continue;

      const dirX = dx / fullLen, dirZ = dz / fullLen;
      const sax = ax + dirX * R, saz = az + dirZ * R;
      const sbx = bx - dirX * R, sbz = bz - dirZ * R;
      const segLen = Math.sqrt((sbx - sax) ** 2 + (sbz - saz) ** 2);

      result.push({
        midX: (sax + sbx) / 2,
        midZ: (saz + sbz) / 2,
        angle: Math.atan2(dx, dz),
        length: segLen,
      });
    }
    return result;
  }, [nodes, connections]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || ceilingData.length === 0) return;

    for (let i = 0; i < ceilingData.length; i++) {
      const c = ceilingData[i];
      _euler.set(0, c.angle, 0);
      _quat.setFromEuler(_euler);
      _pos.set(c.midX, UNDERGROUND_Y + TUNNEL_HEIGHT, c.midZ);
      _one.set(TUNNEL_RADIUS * 2, 0.1, c.length);
      _mat4.compose(_pos, _quat, _one);
      mesh.setMatrixAt(i, _mat4);
    }
    _one.set(1, 1, 1);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ceilingData]);

  if (ceilingData.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, ceilingData.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#1a1c1e" roughness={0.5} metalness={0.6} />
    </instancedMesh>
  );
}

// ── Ceiling support beams (instanced across all tunnels) ──

function TunnelBeams({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const beamRef = useRef<THREE.InstancedMesh>(null);

  const beamCount = useMemo(() => {
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
      count += Math.max(1, Math.floor(len / BEAM_SPACING));
    }
    return count;
  }, [nodes, connections]);

  useEffect(() => {
    const mesh = beamRef.current;
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
      const beamsInSegment = Math.max(1, Math.floor(len / BEAM_SPACING));

      for (let r = 0; r < beamsInSegment; r++) {
        const t = (r + 0.5) / beamsInSegment;
        const px = ax + dirX * len * t;
        const pz = az + dirZ * len * t;

        _euler.set(0, angle, 0);
        _quat.setFromEuler(_euler);
        _pos.set(px, UNDERGROUND_Y + TUNNEL_HEIGHT - 0.08, pz);
        _mat4.compose(_pos, _quat, _one);
        mesh.setMatrixAt(idx++, _mat4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [nodes, connections]);

  if (beamCount === 0) return null;

  return (
    <instancedMesh ref={beamRef} args={[undefined, undefined, beamCount]} frustumCulled={false}>
      <boxGeometry args={[TUNNEL_RADIUS * 2, 0.15, 0.15]} />
      <meshStandardMaterial color="#4a4a40" roughness={0.4} metalness={0.7} />
    </instancedMesh>
  );
}

// ── Tunnel lights (instanced along connections) ──

const MAX_UNDERGROUND_LIGHTS = 6;

function TunnelLights({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const lightFixtureRef = useRef<THREE.InstancedMesh>(null);
  const lightPoolRefs = useRef<(THREE.PointLight | null)[]>([]);

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

      const lightCount = Math.max(1, Math.round(len / 6));
      for (let i = 0; i < lightCount; i++) {
        const t = (i + 0.5) / lightCount;
        positions.push([
          ax + dx * t,
          UNDERGROUND_Y + TUNNEL_HEIGHT - 0.3,
          az + dz * t,
        ]);
      }
    }

    for (const node of nodes) {
      const [nx, ny, nz] = node.undergroundPosition;
      positions.push([nx, ny + TUNNEL_HEIGHT + 3, nz]);     // shaft glow
      positions.push([nx, ny + TUNNEL_HEIGHT * 0.6, nz]);   // chamber ambient
    }

    return positions;
  }, [nodes, connections]);

  useEffect(() => {
    const mesh = lightFixtureRef.current;
    if (!mesh) return;

    const fixtureCount = lightData.length - nodes.length * 2;
    for (let i = 0; i < fixtureCount; i++) {
      _mat4.makeTranslation(lightData[i][0], lightData[i][1], lightData[i][2]);
      mesh.setMatrixAt(i, _mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [lightData, nodes.length]);

  useFrame(() => {
    const { localPosition } = useGameStore.getState();
    const [px, , pz] = localPosition;

    const distances: Array<{ idx: number; distSq: number }> = [];
    for (let i = 0; i < lightData.length; i++) {
      const dx = px - lightData[i][0];
      const dz = pz - lightData[i][2];
      distances.push({ idx: i, distSq: dx * dx + dz * dz });
    }
    distances.sort((a, b) => a.distSq - b.distSq);

    for (let i = 0; i < MAX_UNDERGROUND_LIGHTS; i++) {
      const light = lightPoolRefs.current[i];
      if (!light) continue;
      if (i < distances.length) {
        const pos = lightData[distances[i].idx];
        light.position.set(pos[0], pos[1], pos[2]);
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  });

  const fixtureCount = lightData.length - nodes.length * 2;
  if (fixtureCount <= 0) return null;

  return (
    <>
      <instancedMesh ref={lightFixtureRef} args={[undefined, undefined, fixtureCount]} frustumCulled={false}>
        <boxGeometry args={[0.4, 0.06, 0.2]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.5} />
      </instancedMesh>

      {Array.from({ length: MAX_UNDERGROUND_LIGHTS }, (_, i) => (
        <pointLight
          key={`pool_${i}`}
          ref={(el) => { lightPoolRefs.current[i] = el; }}
          color="#22cc66"
          intensity={3}
          distance={15}
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
      {/* Chamber ceiling (covers the junction area) */}
      <mesh position={[0, TUNNEL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TUNNEL_RADIUS * 2, TUNNEL_RADIUS * 2]} />
        <meshStandardMaterial color="#2a2a28" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical exit shaft */}
      <mesh position={[0, TUNNEL_HEIGHT + 1.5, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 3, 12, 1, true]} />
        <meshStandardMaterial color="#3a3a38" roughness={0.35} metalness={0.75} side={THREE.DoubleSide} />
      </mesh>

      {/* Shaft top cap */}
      <mesh position={[0, TUNNEL_HEIGHT + 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 12]} />
        <meshStandardMaterial color="#1a1a18" roughness={0.5} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Ladder rungs inside shaft */}
      {[0.5, 1.0, 1.5, 2.0, 2.5].map((ly, i) => (
        <mesh key={`rung_${i}`} position={[0, TUNNEL_HEIGHT + ly, 0.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
          <meshStandardMaterial color="#666655" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Green floor marker (exit point) */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.7, 12]} />
        <meshBasicMaterial color={PIPE_GLOW} transparent opacity={0.4} />
      </mesh>

      {/* Shaft light glow */}
      <mesh position={[0, TUNNEL_HEIGHT + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 12]} />
        <meshBasicMaterial color={PIPE_GLOW_DIM} transparent opacity={0.25} />
      </mesh>

      {/* Room name label */}
      <Html position={[0, TUNNEL_HEIGHT - 0.5, 0]} center distanceFactor={10} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0, 15, 8, 0.85)',
          border: `1px solid ${PIPE_GLOW_DIM}`,
          borderRadius: 6,
          padding: '3px 10px',
          color: PIPE_GLOW,
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          fontWeight: 700,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          <div>{node.roomName}</div>
          <div style={{ fontSize: 9, color: '#00aa55', marginTop: 1 }}>EXIT ↑</div>
        </div>
      </Html>
    </group>
  );
}

// ── Underground tunnels composite ──

const PIPE_VISUAL_RANGE_SQ = 25 * 25;

function UndergroundTunnels({ nodes, connections }: { nodes: PipeNode[]; connections: PipeConnection[] }) {
  const pipeWalls = useGameStore((st) => st.mazeLayout?.pipeWalls) ?? [];

  const [nearbyNodeIds, setNearbyNodeIds] = useState<Set<string>>(() => new Set());

  useFrame(() => {
    const { localPosition } = useGameStore.getState();
    const [px, , pz] = localPosition;
    const nearby = new Set<string>();
    for (const node of nodes) {
      const [nx, , nz] = node.undergroundPosition;
      const dx = px - nx;
      const dz = pz - nz;
      if (dx * dx + dz * dz < PIPE_VISUAL_RANGE_SQ) {
        nearby.add(node.id);
      }
    }
    setNearbyNodeIds((prev) => {
      if (prev.size !== nearby.size) return nearby;
      for (const id of nearby) {
        if (!prev.has(id)) return nearby;
      }
      return prev;
    });
  });

  return (
    <group>
      {/* Ceiling void blocker */}
      <mesh position={[0, UNDERGROUND_Y + TUNNEL_HEIGHT + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#050505" side={THREE.DoubleSide} />
      </mesh>

      {/* Floor */}
      <mesh position={[0, UNDERGROUND_Y - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1a1c1a" roughness={0.7} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Ambient underground light */}
      <ambientLight intensity={0.15} color="#0a3320" />

      {/* Tunnel walls — rendered directly from collision data (single source of truth) */}
      <PipeTunnelWalls pipeWalls={pipeWalls} />

      {/* Tunnel ceilings (instanced per connection) */}
      <TunnelCeilings nodes={nodes} connections={connections} />

      {/* Ceiling support beams (instanced) */}
      <TunnelBeams nodes={nodes} connections={connections} />

      {/* Tunnel lights */}
      <TunnelLights nodes={nodes} connections={connections} />

      {/* Node chambers (only nearby) */}
      {nodes.map((node) =>
        nearbyNodeIds.has(node.id) ? <NodeChamber key={node.id} node={node} /> : null,
      )}
    </group>
  );
}

// ── Pipe Interaction (E to enter/exit) ──

function PipeInteraction({ nodes }: { nodes: PipeNode[] }) {
  const [nearestPipe, setNearestPipe] = useState<{ node: PipeNode; isUnderground: boolean } | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useFrame(() => {
    const { localPlayerId, players, localPosition } = useGameStore.getState();
    if (!localPlayerId) return;
    const mySnap = players[localPlayerId];
    if (!mySnap || !mySnap.isAlive) { setNearestPipe(null); return; }

    const isUnderground = mySnap.isUnderground;
    const [px, , pz] = localPosition;

    if (!isUnderground && mySnap.pipeCooldownEnd > 0) {
      const remaining = Math.max(0, Math.ceil((mySnap.pipeCooldownEnd - Date.now()) / 1000));
      setCooldownLeft(remaining);
    } else {
      setCooldownLeft(0);
    }

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

      const pipeLock = gameStore.mazeSnapshot?.pipeLockStates?.[nearestPipe.node.id];
      if (pipeLock?.isLocked) return;

      if (nearestPipe.isUnderground) {
        gameStore.exitPipe(nearestPipe.node.surfacePosition);
        socket.emit('pipe:exit', { pipeNodeId: nearestPipe.node.id });
      } else {
        const mySnap = gameStore.localPlayerId ? gameStore.players[gameStore.localPlayerId] : null;
        if (mySnap && mySnap.pipeCooldownEnd > Date.now()) return;
        gameStore.enterPipe(nearestPipe.node.undergroundPosition, nearestPipe.node.id);
        socket.emit('pipe:enter', { pipeNodeId: nearestPipe.node.id });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nearestPipe]);

  useEffect(() => {
    let lockConsumed = false;
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code !== 'KeyR' || lockConsumed) return;
      lockConsumed = true;

      const gameStore = useGameStore.getState();
      if (gameStore.taskOverlayVisible || gameStore.targetingMode || gameStore.teleportMapOpen || gameStore.hackerPanelOpen) return;

      if (!nearestPipe) return;
      const socket = useNetworkStore.getState().socket;
      if (!socket) return;

      const pipeLock = gameStore.mazeSnapshot?.pipeLockStates?.[nearestPipe.node.id];
      if (pipeLock?.isLocked && pipeLock.hackerLockExpiresAt > 0 && pipeLock.hackerLockExpiresAt > Date.now()) return;

      socket.emit('pipe:lock', { pipeNodeId: nearestPipe.node.id });
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyR') lockConsumed = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [nearestPipe]);

  if (!nearestPipe) return null;

  const target = nearestPipe.isUnderground
    ? nearestPipe.node.undergroundPosition
    : nearestPipe.node.surfacePosition;

  const onCooldown = !nearestPipe.isUnderground && cooldownLeft > 0;

  const mazeSnap = useGameStore.getState().mazeSnapshot;
  const pipeLock = mazeSnap?.pipeLockStates?.[nearestPipe.node.id];
  const isLocked = pipeLock?.isLocked ?? false;
  const isHackerLocked = isLocked && (pipeLock?.hackerLockExpiresAt ?? 0) > Date.now();
  const hackerLockSecsLeft = isHackerLocked
    ? Math.ceil(((pipeLock?.hackerLockExpiresAt ?? 0) - Date.now()) / 1000)
    : 0;

  const borderColor = isLocked ? '#ff4444' : onCooldown ? '#ff6644' : PIPE_GLOW;
  const textColor = isLocked ? '#ff4444' : onCooldown ? '#ff6644' : PIPE_GLOW;

  return (
    <Html position={[target[0], target[1] + 2, target[2]]} center>
      <div style={{
        background: 'rgba(0, 15, 8, 0.92)',
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        padding: '8px 16px',
        textAlign: 'center',
        fontFamily: "'Courier New', monospace",
        color: textColor,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 15px ${isLocked ? 'rgba(255, 68, 68, 0.2)' : onCooldown ? 'rgba(255, 102, 68, 0.2)' : 'rgba(0, 255, 136, 0.2)'}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {nearestPipe.isUnderground
            ? `EXIT: ${nearestPipe.node.roomName}`
            : `PIPE: ${nearestPipe.node.roomName}`}
        </div>
        {isLocked ? (
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {isHackerLocked
              ? `LOCKED (${hackerLockSecsLeft}s)`
              : 'LOCKED'}
            {!isHackerLocked && (
              <div style={{ fontSize: 10, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ background: '#ff4444', color: '#000', borderRadius: 3, padding: '1px 6px', fontWeight: 'bold', fontSize: 10 }}>R</span>
                <span>Unlock</span>
              </div>
            )}
          </div>
        ) : onCooldown ? (
          <div style={{ fontSize: 11, marginTop: 4, color: '#ff6644' }}>
            Cooldown {cooldownLeft}s
          </div>
        ) : (
          <div style={{ fontSize: 11, marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                background: '#ff8800',
                color: '#000',
                borderRadius: 3,
                padding: '1px 6px',
                fontWeight: 'bold',
                fontSize: 10,
              }}>R</span>
              <span style={{ fontSize: 10 }}>Lock</span>
            </div>
          </div>
        )}
      </div>
    </Html>
  );
}

// ── Main Export ──

export function PipeSystem() {
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const isUnderground = useGameStore((st) => {
    const id = st.localPlayerId;
    return id ? st.players[id]?.isUnderground ?? false : false;
  });

  const pipeNodes = mazeLayout?.pipeNodes;
  const pipeConnections = mazeLayout?.pipeConnections;

  if (!pipeNodes || pipeNodes.length === 0 || !pipeConnections) return null;

  return (
    <>
      <PipeEntries nodes={pipeNodes} />
      {isUnderground && (
        <UndergroundTunnels nodes={pipeNodes} connections={pipeConnections} />
      )}
      <PipeInteraction nodes={pipeNodes} />
    </>
  );
}
