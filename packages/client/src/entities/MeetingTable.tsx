import { useRef, useMemo } from 'react';
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

const buttonColor = new THREE.Color('#ff2222');

export function MeetingTable() {
  const buttonRef = useRef<THREE.Mesh>(null);

  const buttonEmissive = useMemo(() => new THREE.Color('#ff0000'), []);

  return (
    <group position={[0, TABLE_Y, 0]}>
      {/* Table top — dark metallic disc */}
      <mesh position={[0, LEG_HEIGHT + TABLE_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 32]} />
        <meshStandardMaterial color="#1a1e28" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Table legs */}
      {LEG_OFFSETS.map(([ox, oz], i) => (
        <mesh key={i} position={[ox, LEG_HEIGHT / 2, oz]} castShadow>
          <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS, LEG_HEIGHT, 8]} />
          <meshStandardMaterial color="#2a2e38" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Central pedestal ring */}
      <mesh position={[0, LEG_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.4, 0.5, LEG_HEIGHT, 16]} />
        <meshStandardMaterial color="#22262f" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Emergency button — red emissive cylinder on top */}
      <mesh
        ref={buttonRef}
        position={[0, LEG_HEIGHT + TABLE_HEIGHT + BUTTON_HEIGHT / 2, 0]}
        castShadow
      >
        <cylinderGeometry args={[BUTTON_RADIUS, BUTTON_RADIUS * 1.1, BUTTON_HEIGHT, 16]} />
        <meshStandardMaterial
          color={buttonColor}
          emissive={buttonEmissive}
          emissiveIntensity={0.6}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Button base ring */}
      <mesh position={[0, LEG_HEIGHT + TABLE_HEIGHT + 0.02, 0]}>
        <cylinderGeometry args={[BUTTON_RADIUS * 1.3, BUTTON_RADIUS * 1.3, 0.04, 16]} />
        <meshStandardMaterial color="#333" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}
