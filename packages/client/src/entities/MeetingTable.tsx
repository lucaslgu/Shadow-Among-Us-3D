import { useRef } from 'react';
import * as THREE from 'three';

const TABLE_Y = 0;
const TABLE_RADIUS = 1.8;
const TABLE_HEIGHT = 0.12;
const LEG_RADIUS = 0.08;
const LEG_HEIGHT = 0.85;
const BUTTON_RADIUS = 0.25;
const BUTTON_HEIGHT = 0.15;

const LEG_OFFSETS: [number, number][] = [
  [1.0, 1.0], [-1.0, 1.0], [1.0, -1.0], [-1.0, -1.0],
];

// ── Module-level material singletons ──

const MT_MAT = {
  tableTop: new THREE.MeshStandardMaterial({ color: '#1a1e28', roughness: 0.3, metalness: 0.8 }),
  leg: new THREE.MeshStandardMaterial({ color: '#2a2e38', roughness: 0.4, metalness: 0.7 }),
  pedestal: new THREE.MeshStandardMaterial({ color: '#22262f', roughness: 0.3, metalness: 0.8 }),
  button: new THREE.MeshStandardMaterial({
    color: '#ff2222',
    emissive: new THREE.Color('#ff0000'),
    emissiveIntensity: 0.6,
    roughness: 0.4,
    metalness: 0.3,
  }),
  buttonBase: new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.5, metalness: 0.6 }),
};

export function MeetingTable() {
  const buttonRef = useRef<THREE.Mesh>(null);

  return (
    <group position={[0, TABLE_Y, 0]}>
      {/* Table top — dark metallic disc */}
      <mesh position={[0, LEG_HEIGHT + TABLE_HEIGHT / 2, 0]} receiveShadow material={MT_MAT.tableTop}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 32]} />
      </mesh>

      {/* Table legs */}
      {LEG_OFFSETS.map(([ox, oz], i) => (
        <mesh key={i} position={[ox, LEG_HEIGHT / 2, oz]} material={MT_MAT.leg}>
          <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS, LEG_HEIGHT, 8]} />
        </mesh>
      ))}

      {/* Central pedestal ring */}
      <mesh position={[0, LEG_HEIGHT / 2, 0]} material={MT_MAT.pedestal}>
        <cylinderGeometry args={[0.4, 0.5, LEG_HEIGHT, 16]} />
      </mesh>

      {/* Emergency button — red emissive cylinder on top */}
      <mesh
        ref={buttonRef}
        position={[0, LEG_HEIGHT + TABLE_HEIGHT + BUTTON_HEIGHT / 2, 0]}
        material={MT_MAT.button}
      >
        <cylinderGeometry args={[BUTTON_RADIUS, BUTTON_RADIUS * 1.1, BUTTON_HEIGHT, 16]} />
      </mesh>

      {/* Button base ring */}
      <mesh position={[0, LEG_HEIGHT + TABLE_HEIGHT + 0.02, 0]} material={MT_MAT.buttonBase}>
        <cylinderGeometry args={[BUTTON_RADIUS * 1.3, BUTTON_RADIUS * 1.3, 0.04, 16]} />
      </mesh>
    </group>
  );
}
