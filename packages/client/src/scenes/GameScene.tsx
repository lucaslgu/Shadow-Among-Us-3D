import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { LocalPlayer } from '../entities/LocalPlayer.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { ThreeBodyEnvironment } from '../environment/ThreeBodyEnvironment.js';
import { MazeRenderer } from '../maze/MazeRenderer.js';
import { HackerAimMode } from '../maze/HackerAimMode.js';
import { DoorInteraction } from '../maze/DoorInteraction.js';
import { TaskInteraction } from '../maze/TaskInteraction.js';
import { OxygenInteraction } from '../maze/OxygenInteraction.js';
import { TaskGuide } from '../maze/TaskGuide.js';
import { MindControlPiP } from '../ui/MindControlPiP.js';
import { PipeSystem } from '../maze/PipeSystem.js';
import { MeetingTable } from '../entities/MeetingTable.js';
import { EmergencyButtonInteraction } from '../entities/EmergencyButtonInteraction.js';
import { DeadBodies } from '../entities/DeadBodies.js';
import { BodyInteraction } from '../entities/BodyInteraction.js';
import { KillInteraction } from '../entities/KillInteraction.js';
import { getFloorTextures, getBeamTextures } from '../textures/spaceship-textures.js';
import { MAP_HALF_EXTENT } from '@shadow/shared';

// ===== Menu Scene (lobby background) =====

function TestCube() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6d28d9" roughness={0.3} metalness={0.7} />
    </mesh>
  );
}

function MenuScene() {
  return (
    <>
      <ambientLight intensity={0.05} color="#4466aa" />
      <spotLight
        position={[5, 8, 5]}
        angle={Math.PI / 6}
        penumbra={0.3}
        intensity={50}
        distance={20}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        color="#ffe4b5"
      />
      <TestCube />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} metalness={0.2} />
      </mesh>
      <Grid
        args={[20, 20]}
        position={[0, 0.01, 0]}
        cellColor="#1a1a3e"
        sectionColor="#2a2a5e"
        fadeDistance={25}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

// ===== Floor (spaceship deck) ======

const MAZE_EXTENT = MAP_HALF_EXTENT; // gridSize * cellSize / 2
const CEILING_HEIGHT = 4; // same as WALL_HEIGHT

const FLOOR_NORMAL_SCALE = new THREE.Vector2(0.4, 0.4);

function SpaceshipFloor() {
  const floorSize = MAZE_EXTENT * 2;
  const floorTex = useMemo(() => {
    const t = getFloorTextures();
    // Tile repeat: 4-unit tiles across the floor
    const tiles = Math.round(floorSize / 4);
    t.map.repeat.set(tiles, tiles);
    t.normalMap.repeat.set(tiles, tiles);
    return t;
  }, []);

  return (
    <>
      {/* Metal deck plate with diamond tread texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial
          map={floorTex.map}
          normalMap={floorTex.normalMap}
          normalScale={FLOOR_NORMAL_SCALE}
          color="#181c22"
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>

      {/* Panel grid lines on the floor */}
      <Grid
        args={[floorSize, floorSize]}
        position={[0, 0.005, 0]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#1a2030"
        sectionSize={10}
        sectionThickness={1.2}
        sectionColor="#2a3448"
        fadeDistance={80}
        fadeStrength={1.5}
      />
    </>
  );
}

// ===== Glass Ceiling (lightweight transparent pane + instanced beams) =====

const _ceilMatrix = new THREE.Matrix4();
const _ceilPos = new THREE.Vector3();
const _ceilScale = new THREE.Vector3();
const _ceilQuat = new THREE.Quaternion();
const BEAM_OFFSETS = [-80, -60, -40, -20, 0, 20, 40, 60, 80];
const NUM_BEAMS = BEAM_OFFSETS.length * 2; // 7 along X + 7 along Z

const BEAM_NORMAL_SCALE = new THREE.Vector2(0.5, 0.5);

function GlassCeiling() {
  const beamRef = useRef<THREE.InstancedMesh>(null);

  const beamTex = useMemo(() => {
    const t = getBeamTextures();
    t.map.repeat.set(8, 1);
    t.normalMap.repeat.set(8, 1);
    return t;
  }, []);

  // Set up beam instances once
  useEffect(() => {
    const mesh = beamRef.current;
    if (!mesh) return;
    let idx = 0;
    for (const offset of BEAM_OFFSETS) {
      // Beam along X
      _ceilPos.set(0, CEILING_HEIGHT, offset);
      _ceilScale.set(MAZE_EXTENT * 2, 0.15, 0.3);
      _ceilMatrix.compose(_ceilPos, _ceilQuat, _ceilScale);
      mesh.setMatrixAt(idx++, _ceilMatrix);
      // Beam along Z
      _ceilPos.set(offset, CEILING_HEIGHT, 0);
      _ceilScale.set(0.3, 0.15, MAZE_EXTENT * 2);
      _ceilMatrix.compose(_ceilPos, _ceilQuat, _ceilScale);
      mesh.setMatrixAt(idx++, _ceilMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      {/* Glass pane — simple transparent, no transmission */}
      <mesh position={[0, CEILING_HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[MAZE_EXTENT * 2, MAZE_EXTENT * 2]} />
        <meshStandardMaterial
          color="#0a0e18"
          transparent
          opacity={0.08}
          roughness={0.05}
          metalness={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Structural frame beams (instanced) */}
      <instancedMesh ref={beamRef} args={[undefined, undefined, NUM_BEAMS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={beamTex.map}
          normalMap={beamTex.normalMap}
          normalScale={BEAM_NORMAL_SCALE}
          color="#1a1e28"
          roughness={0.2}
          metalness={0.9}
        />
      </instancedMesh>
    </group>
  );
}

// ===== Playing Scene (actual game) =====

/** Returns stable player ID list — only re-renders when players join/leave */
function usePlayerIds(): string[] {
  const [ids, setIds] = useState<string[]>(() => Object.keys(useGameStore.getState().players));

  useEffect(() => {
    const unsub = useGameStore.subscribe((state, prev) => {
      if (state.players === prev.players) return;
      const newIds = Object.keys(state.players);
      setIds((prevIds) => {
        if (prevIds.length === newIds.length && prevIds.every((id, i) => id === newIds[i])) {
          return prevIds; // same reference → no re-render
        }
        return newIds;
      });
    });
    return unsub;
  }, []);

  return ids;
}

function PlayingScene() {
  const playerInfo = useGameStore((st) => st.playerInfo);
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const currentEra = useGameStore((st) => st.currentEra);
  const playerIds = usePlayerIds();

  const myColor = (localPlayerId ? playerInfo[localPlayerId]?.color : null) ?? '#ffffff';

  return (
    <>
      {/* Three-Body Problem environmental system (suns, fog, particles, bloom) */}
      <ThreeBodyEnvironment currentEra={currentEra as 'stable' | 'chaosInferno' | 'chaosIce' | undefined} />

      {/* Spaceship deck floor */}
      <SpaceshipFloor />

      {/* Glass viewport ceiling */}
      <GlassCeiling />

      {/* Maze labyrinth */}
      <MazeRenderer />

      {/* Local player */}
      <LocalPlayer color={myColor} />

      {/* Remote players */}
      {playerIds.map((pid) => {
        if (pid === localPlayerId) return null;
        const info = playerInfo[pid];
        if (!info) return null;
        return (
          <RemotePlayer
            key={pid}
            playerId={pid}
            color={info.color}
          />
        );
      })}

      {/* Door interaction prompt */}
      <DoorInteraction />

      {/* Task interaction prompt */}
      <TaskInteraction />

      {/* Oxygen generator interaction */}
      <OxygenInteraction />

      {/* Task pathfinding guide line */}
      <TaskGuide />

      {/* Hacker aim mode overlay */}
      <HackerAimMode />

      {/* Mind Control PiP viewport */}
      <MindControlPiP />

      {/* Central meeting table */}
      <MeetingTable />

      {/* Emergency button interaction */}
      <EmergencyButtonInteraction />

      {/* Dead bodies on the ground */}
      <DeadBodies />

      {/* Body report interaction */}
      <BodyInteraction />

      {/* Kill interaction (shadow proximity check + Space key) */}
      <KillInteraction />

      {/* Underground pipe system */}
      <PipeSystem />

      {/* Third-person camera */}
      <ThirdPersonCamera />

      {/* Post-processing: Bloom for suns/fire glow + Vignette for atmosphere */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
        <Vignette
          offset={0.3}
          darkness={0.6}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>
    </>
  );
}

// ===== Notifies server when 3D scene has mounted (loaded) =====

function SceneLoadedNotifier() {
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    const socket = useNetworkStore.getState().socket;
    if (socket) {
      console.log('[SceneLoadedNotifier] 3D scene mounted — emitting player:loaded');
      socket.emit('player:loaded');
    }
  }, []);
  return null;
}

// ===== Main GameScene =====

function SceneContent() {
  const phase = useGameStore((st) => st.phase);
  // Render PlayingScene during loading, playing, meeting, and results phases
  if (phase === 'loading' || phase === 'playing' || phase === 'meeting' || phase === 'results') {
    return (
      <>
        <PlayingScene />
        {phase === 'loading' && <SceneLoadedNotifier />}
      </>
    );
  }
  return <MenuScene />;
}

export function GameScene() {
  const phase = useGameStore((st) => st.phase);
  const [hasPointerLock, setHasPointerLock] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Track pointer lock state
  useEffect(() => {
    function onPointerLockChange() {
      setHasPointerLock(!!document.pointerLockElement);
    }
    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => document.removeEventListener('pointerlockchange', onPointerLockChange);
  }, []);

  // Request pointer lock on click anywhere in the game container
  const handleContainerClick = useCallback(() => {
    if (phase !== 'playing') return;
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (canvas && !document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  }, [phase]);

  return (
    <div
      ref={canvasContainerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={handleContainerClick}
    >
      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 60 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a0f');
        }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>

      {/* Pointer lock prompt — shown during playing (not loading) when pointer is not locked */}
      {phase === 'playing' && !hasPointerLock && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 5,
            cursor: 'pointer',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
          }}
        >
          <div
            style={{
              background: 'rgba(10, 10, 18, 0.95)',
              border: '1px solid #2a2a45',
              borderRadius: 16,
              padding: '32px 48px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e2f0', marginBottom: 8 }}>
              Click to play
            </div>
            <div style={{ fontSize: 13, color: '#6b6b8a' }}>
              W/A/S/D move | Mouse look | F flashlight | E interact
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
