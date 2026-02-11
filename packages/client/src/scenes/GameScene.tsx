import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Suspense } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { LocalPlayer } from '../entities/LocalPlayer.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { ThreeBodyEnvironment } from '../environment/ThreeBodyEnvironment.js';

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

// ===== Playing Scene (actual game) =====

function PlayingScene() {
  const playerInfo = useGameStore((st) => st.playerInfo);
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);

  const myColor = (localPlayerId ? (players[localPlayerId]?.color ?? playerInfo[localPlayerId]?.color) : null) ?? '#ffffff';

  return (
    <>
      {/* Three-Body Problem environmental system (suns, fog, particles, bloom) */}
      <ThreeBodyEnvironment />

      {/* Large floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0a0a15" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Local player */}
      <LocalPlayer color={myColor} />

      {/* Remote players */}
      {Object.keys(players).map((pid) => {
        if (pid === localPlayerId) return null;
        const info = playerInfo[pid];
        if (!info) return null;
        return (
          <RemotePlayer
            key={pid}
            playerId={pid}
            name={info.name}
            color={players[pid]?.color || info.color}
          />
        );
      })}

      {/* Third-person camera */}
      <ThirdPersonCamera />
    </>
  );
}

// ===== Main GameScene =====

function SceneContent() {
  const phase = useGameStore((st) => st.phase);
  return phase === 'playing' ? <PlayingScene /> : <MenuScene />;
}

export function GameScene() {
  const phase = useGameStore((st) => st.phase);

  return (
    <Canvas
      shadows
      camera={{ position: [5, 5, 5], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#0a0a0f');
      }}
      onClick={(e) => {
        if (phase === 'playing') {
          (e.target as HTMLCanvasElement).requestPointerLock();
        }
      }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
