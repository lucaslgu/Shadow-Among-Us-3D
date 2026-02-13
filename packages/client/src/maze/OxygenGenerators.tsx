import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();

const TANK_RADIUS = 0.4;
const TANK_HEIGHT = 1.8;

/**
 * Renders oxygen generator tanks in the maze.
 * Color shifts based on ship oxygen level:
 * - Blue (>60%), Yellow (25-60%), Red (<25%)
 */
export function OxygenGenerators() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const generators = mazeLayout?.oxygenGenerators;

  const tankRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);

  const count = generators?.length ?? 0;

  // Tank material with emissive that changes color
  const tankMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a2a3a',
    roughness: 0.3,
    metalness: 0.8,
  }), []);

  const capMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#44aaff',
    roughness: 0.2,
    metalness: 0.6,
    emissive: '#44aaff',
    emissiveIntensity: 0.3,
  }), []);

  const glowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#44aaff',
    emissive: '#44aaff',
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.6,
  }), []);

  // Position instances
  useEffect(() => {
    if (!generators || !tankRef.current || !capRef.current || !glowRef.current) return;

    for (let i = 0; i < generators.length; i++) {
      const gen = generators[i];
      const [x, , z] = gen.position;

      // Tank body
      _pos.set(x, TANK_HEIGHT / 2, z);
      _scale.set(1, 1, 1);
      _matrix.compose(_pos, _quat, _scale);
      tankRef.current.setMatrixAt(i, _matrix);

      // Cap on top
      _pos.set(x, TANK_HEIGHT + 0.15, z);
      _matrix.compose(_pos, _quat, _scale);
      capRef.current.setMatrixAt(i, _matrix);

      // Glow ring at base
      _pos.set(x, 0.05, z);
      _matrix.compose(_pos, _quat, _scale);
      glowRef.current.setMatrixAt(i, _matrix);
    }

    tankRef.current.instanceMatrix.needsUpdate = true;
    capRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;
  }, [generators]);

  // Animate color based on ship oxygen level
  useFrame(() => {
    const oxygen = useGameStore.getState().shipOxygen;
    const t = performance.now() / 1000;

    let color: THREE.Color;
    let emissiveIntensity: number;

    if (oxygen > 60) {
      color = new THREE.Color('#44aaff');
      emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.1;
    } else if (oxygen > 25) {
      color = new THREE.Color('#ffaa22');
      emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.2;
    } else {
      color = new THREE.Color('#ff3333');
      emissiveIntensity = 0.8 + Math.sin(t * 5) * 0.3;
    }

    capMat.color.copy(color);
    capMat.emissive.copy(color);
    capMat.emissiveIntensity = emissiveIntensity;

    glowMat.color.copy(color);
    glowMat.emissive.copy(color);
    glowMat.emissiveIntensity = emissiveIntensity * 1.5;
    glowMat.opacity = 0.4 + Math.sin(t * 3) * 0.2;
  });

  if (count === 0) return null;

  return (
    <group>
      {/* Tank bodies */}
      <instancedMesh ref={tankRef} args={[undefined, undefined, count]} frustumCulled={false} material={tankMat}>
        <cylinderGeometry args={[TANK_RADIUS, TANK_RADIUS * 1.1, TANK_HEIGHT, 8]} />
      </instancedMesh>

      {/* Caps on top */}
      <instancedMesh ref={capRef} args={[undefined, undefined, count]} frustumCulled={false} material={capMat}>
        <sphereGeometry args={[TANK_RADIUS * 0.8, 8, 6]} />
      </instancedMesh>

      {/* Glow rings at base */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, count]} frustumCulled={false} material={glowMat}>
        <torusGeometry args={[TANK_RADIUS * 1.5, 0.08, 6, 16]} />
      </instancedMesh>
    </group>
  );
}
