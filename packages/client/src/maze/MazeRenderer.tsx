import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WallSegment, DoorInfo, LightInfo, MazeRoomInfo, ShelterZone } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';
import { getWallTextures } from '../textures/spaceship-textures.js';
import { playMuralhaDestroy } from '../audio/sound-manager.js';
import { TaskStations } from './TaskStations.js';
import { DecoObjects } from './DecoObjects.js';
import { OxygenGenerators } from './OxygenGenerators.js';
import { RoomEnvironments } from './RoomEnvironments.js';

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.3;
const CELL_SIZE = 10;
const MAX_VISIBLE_LIGHTS = 6;
const LIGHT_INTENSITY = 8;
const LIGHT_DISTANCE = 15;

// Door frame constants
const PILLAR_WIDTH = 0.35;
const PILLAR_DEPTH = 0.4;
const LINTEL_HEIGHT = 0.4;
const DOOR_GAP = 2.5;

// ── Wall textures (lazy singleton) ──

const WALL_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);

// ── Reusable temp objects ──

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _identityQuat = new THREE.Quaternion();
const _color = new THREE.Color();

// ── Helpers ──

function computeWallTransform(wall: WallSegment): { px: number; py: number; pz: number; sx: number; sy: number; sz: number } {
  const [x1, z1] = wall.start;
  const [x2, z2] = wall.end;
  const dx = Math.abs(x2 - x1);
  const dz = Math.abs(z2 - z1);
  const length = Math.max(dx, dz, 0.1);

  if (dx >= dz) {
    return {
      px: (x1 + x2) / 2, py: WALL_HEIGHT / 2, pz: (z1 + z2) / 2,
      sx: length, sy: WALL_HEIGHT, sz: WALL_THICKNESS,
    };
  } else {
    return {
      px: (x1 + x2) / 2, py: WALL_HEIGHT / 2, pz: (z1 + z2) / 2,
      sx: WALL_THICKNESS, sy: WALL_HEIGHT, sz: length,
    };
  }
}

// ── Static Walls (never change) ──

function StaticWalls({ walls }: { walls: WallSegment[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const wallTex = useMemo(() => {
    const t = getWallTextures();
    t.map.repeat.set(3, 1);
    t.normalMap.repeat.set(3, 1);
    return t;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || walls.length === 0) return;

    for (let i = 0; i < walls.length; i++) {
      const t = computeWallTransform(walls[i]);
      _pos.set(t.px, t.py, t.pz);
      _scale.set(t.sx, t.sy, t.sz);
      _matrix.compose(_pos, _identityQuat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [walls]);

  if (walls.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, walls.length]} receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={wallTex.map}
        normalMap={wallTex.normalMap}
        normalScale={WALL_NORMAL_SCALE}
        color="#22252e"
        roughness={0.35}
        metalness={0.75}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

// ── Mutable Walls (dynamic + door walls, animate open/close) ──

function MutableWalls({ walls }: { walls: WallSegment[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const wallTex = useMemo(() => {
    const t = getWallTextures();
    t.map.repeat.set(3, 1);
    t.normalMap.repeat.set(3, 1);
    return t;
  }, []);

  const transforms = useMemo(() => walls.map(computeWallTransform), [walls]);
  const currentScaleY = useRef<Float32Array>(new Float32Array(0));
  const targetScaleY = useRef<Float32Array>(new Float32Array(0));

  // Initialize instance matrices so walls are visible before any animation
  useEffect(() => {
    const mesh = meshRef.current;
    currentScaleY.current = new Float32Array(walls.length).fill(1);
    targetScaleY.current = new Float32Array(walls.length).fill(1);

    if (!mesh || walls.length === 0) return;
    for (let i = 0; i < walls.length; i++) {
      const t = transforms[i];
      _pos.set(t.px, t.py, t.pz);
      _scale.set(t.sx, t.sy, t.sz);
      _matrix.compose(_pos, _identityQuat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [walls, transforms]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const mazeSnapshot = useGameStore.getState().mazeSnapshot;
    if (!mesh || !mazeSnapshot || walls.length === 0) return;

    const speed = 6;
    const factor = 1 - Math.exp(-speed * delta);
    let needsUpdate = false;

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const t = transforms[i];

      let tgt = 1;
      if (wall.isDynamic) {
        const closed = mazeSnapshot.dynamicWallStates[wall.id];
        tgt = closed !== false ? 1 : 0;
      }
      if (wall.hasDoor && wall.doorId) {
        const doorState = mazeSnapshot.doorStates[wall.doorId];
        if (doorState?.isOpen && !doorState.isLocked) tgt = 0;
      }

      targetScaleY.current[i] = tgt;
      const cur = currentScaleY.current[i];
      const diff = tgt - cur;

      // Skip matrix update if already at target
      if (Math.abs(diff) < 0.001) {
        if (cur !== tgt) { currentScaleY.current[i] = tgt; needsUpdate = true; }
        continue;
      }

      const newY = cur + diff * factor;
      currentScaleY.current[i] = newY;
      needsUpdate = true;

      _pos.set(t.px, (newY * t.sy) / 2, t.pz);
      _scale.set(t.sx, Math.max(0.001, newY * t.sy), t.sz);
      _matrix.compose(_pos, _identityQuat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }

    if (needsUpdate) mesh.instanceMatrix.needsUpdate = true;
  });

  if (walls.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, walls.length]} receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={wallTex.map}
        normalMap={wallTex.normalMap}
        normalScale={WALL_NORMAL_SCALE}
        color="#22252e"
        roughness={0.35}
        metalness={0.75}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

// ── Door Frames (InstancedMesh — pillars + lintels + indicators) ──

function DoorFrames({ doors }: { doors: DoorInfo[] }) {
  const pillarRef = useRef<THREE.InstancedMesh>(null);
  const lintelRef = useRef<THREE.InstancedMesh>(null);
  const indicatorRef = useRef<THREE.InstancedMesh>(null);
  const prevLockStates = useRef<boolean[]>([]);

  const numDoors = doors.length;

  // Set up transforms + initial colors once
  useEffect(() => {
    const pillar = pillarRef.current;
    const lintel = lintelRef.current;
    const indicator = indicatorRef.current;
    if (!pillar || !lintel || !indicator || numDoors === 0) return;

    for (let i = 0; i < numDoors; i++) {
      const door = doors[i];
      const [dx, , dz] = door.position;
      const isX = door.axis === 'x';
      const halfGap = DOOR_GAP / 2;

      const pillarSx = isX ? PILLAR_WIDTH : PILLAR_DEPTH;
      const pillarSz = isX ? PILLAR_DEPTH : PILLAR_WIDTH;

      // Left pillar
      _pos.set(isX ? dx - halfGap : dx, WALL_HEIGHT / 2, isX ? dz : dz - halfGap);
      _scale.set(pillarSx, WALL_HEIGHT, pillarSz);
      _matrix.compose(_pos, _identityQuat, _scale);
      pillar.setMatrixAt(i * 2, _matrix);

      // Right pillar
      _pos.set(isX ? dx + halfGap : dx, WALL_HEIGHT / 2, isX ? dz : dz + halfGap);
      _matrix.compose(_pos, _identityQuat, _scale);
      pillar.setMatrixAt(i * 2 + 1, _matrix);

      // Lintel
      const lintelSx = isX ? DOOR_GAP + PILLAR_WIDTH : PILLAR_DEPTH;
      const lintelSz = isX ? PILLAR_DEPTH : DOOR_GAP + PILLAR_WIDTH;
      _pos.set(dx, WALL_HEIGHT - LINTEL_HEIGHT / 2, dz);
      _scale.set(lintelSx, LINTEL_HEIGHT, lintelSz);
      _matrix.compose(_pos, _identityQuat, _scale);
      lintel.setMatrixAt(i, _matrix);

      // Lock indicator
      _pos.set(dx, WALL_HEIGHT - LINTEL_HEIGHT - 0.2, dz);
      _scale.set(0.24, 0.24, 0.24);
      _matrix.compose(_pos, _identityQuat, _scale);
      indicator.setMatrixAt(i, _matrix);

      // Init colors (unlocked state)
      _color.set('#2a3040');
      pillar.setColorAt(i * 2, _color);
      pillar.setColorAt(i * 2 + 1, _color);
      lintel.setColorAt(i, _color);
      _color.set('#44aaff');
      indicator.setColorAt(i, _color);
    }

    pillar.instanceMatrix.needsUpdate = true;
    lintel.instanceMatrix.needsUpdate = true;
    indicator.instanceMatrix.needsUpdate = true;
    if (pillar.instanceColor) pillar.instanceColor.needsUpdate = true;
    if (lintel.instanceColor) lintel.instanceColor.needsUpdate = true;
    if (indicator.instanceColor) indicator.instanceColor.needsUpdate = true;

    prevLockStates.current = new Array(numDoors).fill(false);
  }, [doors, numDoors]);

  // Update colors only when lock state changes
  useFrame(() => {
    const mazeSnapshot = useGameStore.getState().mazeSnapshot;
    if (!mazeSnapshot || !pillarRef.current || !indicatorRef.current || !lintelRef.current) return;

    let changed = false;
    for (let i = 0; i < numDoors; i++) {
      const isLocked = mazeSnapshot.doorStates[doors[i].id]?.isLocked ?? false;
      if (prevLockStates.current[i] === isLocked) continue;
      prevLockStates.current[i] = isLocked;
      changed = true;

      _color.set(isLocked ? '#553333' : '#2a3040');
      pillarRef.current.setColorAt(i * 2, _color);
      pillarRef.current.setColorAt(i * 2 + 1, _color);
      lintelRef.current.setColorAt(i, _color);

      _color.set(isLocked ? '#ff0000' : '#44aaff');
      indicatorRef.current.setColorAt(i, _color);
    }

    if (changed) {
      if (pillarRef.current.instanceColor) pillarRef.current.instanceColor.needsUpdate = true;
      if (lintelRef.current.instanceColor) lintelRef.current.instanceColor.needsUpdate = true;
      if (indicatorRef.current.instanceColor) indicatorRef.current.instanceColor.needsUpdate = true;
    }
  });

  if (numDoors === 0) return null;

  return (
    <>
      {/* Pillars (2 per door) */}
      <instancedMesh ref={pillarRef} args={[undefined, undefined, numDoors * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.25} metalness={0.85} />
      </instancedMesh>

      {/* Lintels (1 per door) */}
      <instancedMesh ref={lintelRef} args={[undefined, undefined, numDoors]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.25} metalness={0.85} />
      </instancedMesh>

      {/* Lock indicators (1 per door) */}
      <instancedMesh ref={indicatorRef} args={[undefined, undefined, numDoors]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Invisible raycast targets for hacker aim (per-door userData) */}
      {doors.map((door) => (
        <mesh
          key={`dt_${door.id}`}
          position={[door.position[0], WALL_HEIGHT / 2, door.position[2]]}
          userData={{ hackerTargetType: 'door', hackerTargetId: door.id }}
        >
          <boxGeometry args={[DOOR_GAP, WALL_HEIGHT, PILLAR_DEPTH]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
}

// ── Room Signs (CanvasTexture on door frame — no Html) ──

function createSignTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Dark metallic background
  ctx.fillStyle = '#080c14';
  ctx.fillRect(0, 0, 256, 64);

  // Border
  ctx.strokeStyle = '#2a4466';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 60);

  // Glowing text — auto-fit to canvas width
  ctx.fillStyle = '#88ccff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#44aaff';
  ctx.shadowBlur = 8;
  const maxWidth = 240;
  const label = name.toUpperCase();
  let fs = 20;
  ctx.font = `bold ${fs}px monospace`;
  while (fs > 10 && ctx.measureText(label).width > maxWidth) {
    fs--;
    ctx.font = `bold ${fs}px monospace`;
  }
  ctx.fillText(label, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function RoomSigns({ rooms, doors }: { rooms: MazeRoomInfo[]; doors: DoorInfo[] }) {
  const signData = useMemo(() => {
    const doorMap = new Map<string, DoorInfo>();
    for (const d of doors) doorMap.set(d.id, d);

    return rooms.map((room) => {
      const door = room.doorId ? doorMap.get(room.doorId) : null;
      return {
        id: room.id,
        x: door ? door.position[0] : room.position[0],
        z: door ? door.position[2] : room.position[2],
        axis: door ? door.axis : ('x' as const),
        texture: createSignTexture(room.name),
      };
    });
  }, [rooms, doors]);

  // Cleanup textures on unmount
  useEffect(() => {
    return () => { for (const s of signData) s.texture.dispose(); };
  }, [signData]);

  const signY = WALL_HEIGHT - LINTEL_HEIGHT - 0.35;

  return (
    <>
      {signData.map((s) => {
        // Rotate sign to face perpendicular to the wall
        const rotY = s.axis === 'z' ? Math.PI / 2 : 0;
        return (
          <group key={s.id} position={[s.x, signY, s.z]} rotation={[0, rotY, 0]}>
            {/* Front face */}
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[2.0, 0.5]} />
              <meshBasicMaterial map={s.texture} transparent />
            </mesh>
            {/* Back face (rotated so text reads correctly from both sides) */}
            <mesh position={[0, 0, -0.02]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[2.0, 0.5]} />
              <meshBasicMaterial map={s.texture} transparent />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ── Cell Lights (PointLight pool + ceiling panels) ──

function CellLights({ lights }: { lights: LightInfo[] }) {

  const panelRef = useRef<THREE.InstancedMesh>(null);
  const panelColorAttr = useRef<THREE.InstancedBufferAttribute | null>(null);
  const lightPoolRefs = useRef<(THREE.PointLight | null)[]>([]);

  // Pre-allocate sort array to avoid GC pressure
  const sortBuffer = useRef<{ idx: number; distSq: number }[]>([]);

  useEffect(() => {
    const mesh = panelRef.current;
    if (!mesh || lights.length === 0) return;

    for (let i = 0; i < lights.length; i++) {
      const [lx, ly, lz] = lights[i].position;
      _pos.set(lx, ly, lz);
      _scale.set(1, 0.1, 1);
      _matrix.compose(_pos, _identityQuat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const colors = new Float32Array(lights.length * 3);
    for (let i = 0; i < lights.length; i++) {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.9;
      colors[i * 3 + 2] = 0.7;
    }
    const attr = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor = attr;
    panelColorAttr.current = attr;

    // Init sort buffer
    sortBuffer.current = lights.map((_, idx) => ({ idx, distSq: 0 }));
  }, [lights]);

  useFrame(() => {
    const { mazeSnapshot, localPosition } = useGameStore.getState();
    if (!mazeSnapshot || !panelColorAttr.current) return;

    const [px, , pz] = localPosition;
    const attr = panelColorAttr.current;

    // Update panel colors + build sorted light list in one pass
    let onCount = 0;
    const buf = sortBuffer.current;

    for (let i = 0; i < lights.length; i++) {
      const isOn = mazeSnapshot.lightStates[lights[i].id] !== false;
      const idx3 = i * 3;
      if (isOn) {
        attr.array[idx3] = 1;
        attr.array[idx3 + 1] = 0.9;
        attr.array[idx3 + 2] = 0.7;
        const [lx, , lz] = lights[i].position;
        buf[onCount].idx = i;
        buf[onCount].distSq = (lx - px) * (lx - px) + (lz - pz) * (lz - pz);
        onCount++;
      } else {
        attr.array[idx3] = 0.06;
        attr.array[idx3 + 1] = 0.06;
        attr.array[idx3 + 2] = 0.06;
      }
    }
    attr.needsUpdate = true;

    // Partial sort: only find top MAX_VISIBLE_LIGHTS (selection sort is faster for small k)
    const k = Math.min(MAX_VISIBLE_LIGHTS, onCount);
    for (let i = 0; i < k; i++) {
      let minIdx = i;
      for (let j = i + 1; j < onCount; j++) {
        if (buf[j].distSq < buf[minIdx].distSq) minIdx = j;
      }
      if (minIdx !== i) {
        const tmp = buf[i];
        buf[i] = buf[minIdx];
        buf[minIdx] = tmp;
      }
    }

    for (let j = 0; j < MAX_VISIBLE_LIGHTS; j++) {
      const pl = lightPoolRefs.current[j];
      if (!pl) continue;
      if (j < k) {
        const light = lights[buf[j].idx];
        pl.position.set(light.position[0], light.position[1] - 0.2, light.position[2]);
        pl.visible = true;
      } else {
        pl.visible = false;
      }
    }
  });

  if (lights.length === 0) return null;

  return (
    <>
      <instancedMesh ref={panelRef} args={[undefined, undefined, lights.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#181c24"
          roughness={0.2}
          metalness={0.7}
          emissive="#ffcc88"
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </instancedMesh>

      {Array.from({ length: MAX_VISIBLE_LIGHTS }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightPoolRefs.current[i] = el; }}
          color="#ffe4b5"
          intensity={LIGHT_INTENSITY}
          distance={LIGHT_DISTANCE}
          decay={2}
          visible={false}
        />
      ))}

      {/* Raycast targets for hacker aim mode */}
      {lights.map((light) => (
        <mesh
          key={`lt_${light.id}`}
          position={light.position}
          userData={{ hackerTargetType: 'light', hackerTargetId: light.id }}
        >
          <boxGeometry args={[2, 0.5, 2]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
}

// ── Wall Trim (baseboard + top rail — adds 3D depth to walls) ──

const TRIM_HEIGHT = 0.12;
const TRIM_DEPTH = 0.08; // how much it protrudes

function WallTrim({ walls }: { walls: WallSegment[] }) {
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const topRef = useRef<THREE.InstancedMesh>(null);
  const count = walls.length;

  useEffect(() => {
    const base = baseRef.current;
    const top = topRef.current;
    if (!base || !top || count === 0) return;

    for (let i = 0; i < count; i++) {
      const t = computeWallTransform(walls[i]);
      // Baseboard — sits at bottom of wall, slightly wider
      _pos.set(t.px, TRIM_HEIGHT / 2, t.pz);
      _scale.set(t.sx + TRIM_DEPTH, TRIM_HEIGHT, t.sz + TRIM_DEPTH);
      _matrix.compose(_pos, _identityQuat, _scale);
      base.setMatrixAt(i, _matrix);

      // Top rail — sits at top of wall, slightly wider
      _pos.set(t.px, WALL_HEIGHT - TRIM_HEIGHT / 2, t.pz);
      _matrix.compose(_pos, _identityQuat, _scale);
      top.setMatrixAt(i, _matrix);
    }
    base.instanceMatrix.needsUpdate = true;
    top.instanceMatrix.needsUpdate = true;
  }, [walls, count]);

  if (count === 0) return null;

  return (
    <>
      <instancedMesh ref={baseRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a1e28" roughness={0.25} metalness={0.85} />
      </instancedMesh>
      <instancedMesh ref={topRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a1e28" roughness={0.25} metalness={0.85} />
      </instancedMesh>
    </>
  );
}

// ── Muralha Walls (temporary barrier walls from MURALHA power) ──

const EMPTY_MURALHA: import('@shadow/shared').MuralhaWall[] = [];
const MURALHA_THICKNESS = 0.6;

/** Procedural cement texture — generated once and reused */
function createCementTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base gray concrete
  ctx.fillStyle = '#7a7a78';
  ctx.fillRect(0, 0, size, size);

  // Noise / grain
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v}, ${v}, ${v - 5}, 0.3)`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // Subtle cracks / lines
  ctx.strokeStyle = 'rgba(50, 50, 48, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let lx = Math.random() * size;
    let ly = Math.random() * size;
    ctx.moveTo(lx, ly);
    for (let j = 0; j < 4; j++) {
      lx += (Math.random() - 0.5) * 60;
      ly += Math.random() * 40;
      ctx.lineTo(lx, ly);
    }
    ctx.stroke();
  }

  // Form lines (horizontal marks from concrete forms)
  ctx.strokeStyle = 'rgba(60, 60, 58, 0.2)';
  ctx.lineWidth = 2;
  for (let y = 0; y < size; y += 32 + Math.random() * 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function createCementNormalMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Flat normal (128, 128, 255)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  // Surface bumps
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 128 + (Math.random() - 0.5) * 30;
    const g = 128 + (Math.random() - 0.5) * 30;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

let _cementTex: THREE.CanvasTexture | null = null;
let _cementNormal: THREE.CanvasTexture | null = null;
function getCementTextures() {
  if (!_cementTex) _cementTex = createCementTexture();
  if (!_cementNormal) _cementNormal = createCementNormalMap();
  return { map: _cementTex, normalMap: _cementNormal };
}

const MURALHA_RISE_DURATION = 0.5; // seconds for wall to rise from ground
const MURALHA_DESTROY_DURATION = 1.0; // seconds for destruction animation

interface MuralhaAnimState {
  ownerId: string;
  start: [number, number];
  end: [number, number];
  phase: 'rising' | 'idle' | 'destroying';
  progress: number; // 0→1 for rising, 0→1 for destroying
  shakeOffset: number;
}

function MuralhaWalls() {
  const muralhaWalls = useGameStore((s) => s.mazeSnapshot?.muralhaWalls ?? EMPTY_MURALHA);
  const textures = useMemo(() => getCementTextures(), []);
  const animStatesRef = useRef<Map<string, MuralhaAnimState>>(new Map());
  const meshRefsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const matRefsMap = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());

  // Sync animation states with server data (keyed by wallId for multi-wall support)
  const activeIds = useMemo(() => new Set(muralhaWalls.map((mw) => mw.wallId)), [muralhaWalls]);

  // Detect new walls → start rising animation
  for (const mw of muralhaWalls) {
    if (!animStatesRef.current.has(mw.wallId)) {
      animStatesRef.current.set(mw.wallId, {
        ownerId: mw.wallId,
        start: mw.start,
        end: mw.end,
        phase: 'rising',
        progress: 0,
        shakeOffset: 0,
      });
    }
  }

  // Detect removed walls → start destroying animation + sound
  for (const [id, state] of animStatesRef.current) {
    if (!activeIds.has(id) && state.phase !== 'destroying') {
      state.phase = 'destroying';
      state.progress = 0;
      playMuralhaDestroy();
    }
  }

  // Animation loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    for (const [id, state] of animStatesRef.current) {
      if (state.phase === 'rising') {
        state.progress = Math.min(1, state.progress + dt / MURALHA_RISE_DURATION);
        if (state.progress >= 1) state.phase = 'idle';
      } else if (state.phase === 'destroying') {
        state.progress = Math.min(1, state.progress + dt / MURALHA_DESTROY_DURATION);
        // Shake intensifies then dies
        state.shakeOffset = Math.sin(state.progress * 30) * 0.15 * (1 - state.progress);
        if (state.progress >= 1) {
          animStatesRef.current.delete(id);
          meshRefsMap.current.delete(id);
          matRefsMap.current.delete(id);
          continue;
        }
      }

      // Apply transforms to mesh
      const mesh = meshRefsMap.current.get(id);
      const mat = matRefsMap.current.get(id);
      if (!mesh) continue;

      const [x1, z1] = state.start;
      const [x2, z2] = state.end;
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;

      if (state.phase === 'rising') {
        // Ease-out curve for natural deceleration
        const t = 1 - Math.pow(1 - state.progress, 3);
        const scaleY = t;
        mesh.scale.y = scaleY;
        // Rise from ground: position.y goes from 0 to WALL_HEIGHT/2
        mesh.position.y = (WALL_HEIGHT * scaleY) / 2;
        mesh.position.x = cx;
        mesh.position.z = cz;
      } else if (state.phase === 'destroying') {
        // Collapse downward with shake
        const t = state.progress;
        const collapseEase = t * t; // accelerating collapse
        const scaleY = Math.max(0, 1 - collapseEase);
        mesh.scale.y = scaleY;
        mesh.position.y = (WALL_HEIGHT * scaleY) / 2;
        mesh.position.x = cx + state.shakeOffset;
        mesh.position.z = cz + state.shakeOffset * 0.7;
        // Fade opacity
        if (mat) {
          mat.opacity = 1 - t * t;
          mat.transparent = true;
        }
      } else {
        mesh.scale.y = 1;
        mesh.position.y = WALL_HEIGHT / 2;
        mesh.position.x = cx;
        mesh.position.z = cz;
      }
    }
  });

  // Collect all walls to render (active + destroying)
  const allWalls = Array.from(animStatesRef.current.values());
  if (allWalls.length === 0) return null;

  return (
    <group>
      {allWalls.map((state) => {
        const [x1, z1] = state.start;
        const [x2, z2] = state.end;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dz * dz);
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const angle = Math.atan2(dx, dz);

        return (
          <mesh
            key={`muralha_${state.ownerId}`}
            ref={(m) => { if (m) meshRefsMap.current.set(state.ownerId, m); }}
            position={[cx, WALL_HEIGHT / 2, cz]}
            rotation={[0, angle, 0]}
            receiveShadow
          >
            <boxGeometry args={[MURALHA_THICKNESS, WALL_HEIGHT, length]} />
            <meshStandardMaterial
              ref={(m) => { if (m) matRefsMap.current.set(state.ownerId, m); }}
              map={textures.map}
              normalMap={textures.normalMap}
              normalScale={new THREE.Vector2(0.5, 0.5)}
              color="#8a8a85"
              roughness={0.85}
              metalness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Room Ceilings (InstancedMesh) ──

const CEILING_MAT = new THREE.MeshStandardMaterial({
  color: '#1a1e28',
  roughness: 0.25,
  metalness: 0.9,
});

function RoomCeilings({ rooms }: { rooms: MazeRoomInfo[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < rooms.length; i++) {
      const [rx, , rz] = rooms[i].position;
      _pos.set(rx, WALL_HEIGHT, rz);
      _scale.set(CELL_SIZE, 0.15, CELL_SIZE);
      _matrix.compose(_pos, _identityQuat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [rooms]);

  if (rooms.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, rooms.length]}
      frustumCulled={false}
      material={CEILING_MAT}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

// ── Shelter Zone Markers ──

function ShelterMarkers({ shelters }: { shelters: ShelterZone[] }) {
  if (shelters.length === 0) return null;

  return (
    <group>
      {shelters.map((shelter) => {
        const [sx, , sz] = shelter.position;
        return (
          <mesh
            key={shelter.roomId}
            position={[sx, 0.03, sz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[shelter.radius, 32]} />
            <meshBasicMaterial
              color="#22cc66"
              transparent
              opacity={0.12}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Main MazeRenderer ──

export function MazeRenderer() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);

  const { staticWalls, mutableWalls, allWalls } = useMemo(() => {
    if (!mazeLayout) return { staticWalls: [] as WallSegment[], mutableWalls: [] as WallSegment[], allWalls: [] as WallSegment[] };

    const s: WallSegment[] = [];
    const m: WallSegment[] = [];

    for (const wall of mazeLayout.walls) {
      if (wall.isDynamic || wall.hasDoor) {
        m.push(wall);
      } else {
        s.push(wall);
      }
    }

    return { staticWalls: s, mutableWalls: m, allWalls: mazeLayout.walls };
  }, [mazeLayout]);

  if (!mazeLayout) return null;

  return (
    <group>
      <StaticWalls walls={staticWalls} />
      <MutableWalls walls={mutableWalls} />
      <WallTrim walls={allWalls} />
      <DoorFrames doors={mazeLayout.doors} />
      <RoomSigns rooms={mazeLayout.rooms} doors={mazeLayout.doors} />
      <CellLights lights={mazeLayout.lights} />
      <MuralhaWalls />
      <RoomCeilings rooms={mazeLayout.rooms} />
      <ShelterMarkers shelters={mazeLayout.shelterZones ?? []} />
      <TaskStations />
      <DecoObjects />
      <OxygenGenerators />
      <RoomEnvironments />
    </group>
  );
}
