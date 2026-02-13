import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';

const MAX_BODIES = 20;

// Reusable objects (module-level to avoid GC in useFrame)
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(0.4, 0.4, 0.8);
const _color = new THREE.Color();

// Rotation: capsule lying on its side (90 degrees on Z axis)
const LYING_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

export function DeadBodies() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const prevCountRef = useRef(0);

  // Initialize all instances as invisible (scale 0)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const zeroScale = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < MAX_BODIES; i++) {
      _matrix.compose(_position.set(0, -100, 0), _quaternion, zeroScale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const bodies = useGameStore.getState().bodies;
    const count = Math.min(bodies.length, MAX_BODIES);

    // Update instances
    for (let i = 0; i < count; i++) {
      const body = bodies[i];
      _position.set(body.position[0], 0.25, body.position[2]);
      _matrix.compose(_position, LYING_QUAT, _scale);
      mesh.setMatrixAt(i, _matrix);

      _color.set(body.victimColor);
      mesh.setColorAt(i, _color);
    }

    // Hide unused instances
    if (count < prevCountRef.current) {
      for (let i = count; i < prevCountRef.current; i++) {
        _matrix.compose(_position.set(0, -100, 0), _quaternion, _scale.set(0, 0, 0));
        mesh.setMatrixAt(i, _matrix);
      }
      // Restore scale for next frame
      _scale.set(0.4, 0.4, 0.8);
    }

    mesh.count = count;
    if (count > 0 || prevCountRef.current > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    prevCountRef.current = count;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BODIES]} frustumCulled={false}>
      <capsuleGeometry args={[0.5, 0.8, 4, 8]} />
      <meshStandardMaterial roughness={0.6} metalness={0.3} />
    </instancedMesh>
  );
}
