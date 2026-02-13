import { useMemo, useState, useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DecoObjectInfo } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ── Shared Materials (module-level singletons — NOT recreated per mount) ──

const DM = {
  // Action figure colors
  figRed: new THREE.MeshStandardMaterial({ color: '#ff4444', roughness: 0.5, metalness: 0.3 }),
  figGreen: new THREE.MeshStandardMaterial({ color: '#44ff44', roughness: 0.5, metalness: 0.3 }),
  figBlue: new THREE.MeshStandardMaterial({ color: '#4444ff', roughness: 0.5, metalness: 0.3 }),
  figOrange: new THREE.MeshStandardMaterial({ color: '#ffaa00', roughness: 0.5, metalness: 0.3 }),
  figPink: new THREE.MeshStandardMaterial({ color: '#ff44ff', roughness: 0.5, metalness: 0.3 }),
  // Pop-it
  popPink: new THREE.MeshStandardMaterial({ color: '#ff66aa', roughness: 0.6, metalness: 0.2 }),
  // Plush
  plushBrown: new THREE.MeshStandardMaterial({ color: '#aa8866', roughness: 0.8, metalness: 0.1 }),
  // Building blocks
  blockRed: new THREE.MeshStandardMaterial({ color: '#ff4444', roughness: 0.5, metalness: 0.2 }),
  blockBlue: new THREE.MeshStandardMaterial({ color: '#44aaff', roughness: 0.5, metalness: 0.2 }),
  blockYellow: new THREE.MeshStandardMaterial({ color: '#ffdd44', roughness: 0.5, metalness: 0.2 }),
  // Books
  woodDark: new THREE.MeshStandardMaterial({ color: '#5c3a1e', roughness: 0.8, metalness: 0.1 }),
  woodShelf: new THREE.MeshStandardMaterial({ color: '#4a2e15', roughness: 0.8, metalness: 0.1 }),
  bookRed: new THREE.MeshStandardMaterial({ color: '#8b2222', roughness: 0.7 }),
  bookBlue: new THREE.MeshStandardMaterial({ color: '#1a5276', roughness: 0.7 }),
  bookGreen: new THREE.MeshStandardMaterial({ color: '#1e8449', roughness: 0.7 }),
  bookPurple: new THREE.MeshStandardMaterial({ color: '#7d3c98', roughness: 0.7 }),
  bookGold: new THREE.MeshStandardMaterial({ color: '#b7950b', roughness: 0.7 }),
  bookDark: new THREE.MeshStandardMaterial({ color: '#2e4053', roughness: 0.7 }),
  // Medical
  metalLight: new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.4, metalness: 0.5 }),
  mattress: new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.8, metalness: 0.0 }),
  pillow: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9, metalness: 0.0 }),
  metalMed: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.3, metalness: 0.7 }),
  headboard: new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.4, metalness: 0.5 }),
  ivPole: new THREE.MeshStandardMaterial({ color: '#bbbbbb', roughness: 0.3, metalness: 0.7 }),
  ivBase: new THREE.MeshStandardMaterial({ color: '#999999', roughness: 0.3, metalness: 0.7 }),
  ivBag: new THREE.MeshStandardMaterial({ color: '#aaddff', roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.8 }),
  cabinetBody: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.5, metalness: 0.3 }),
  cabinetCross: new THREE.MeshStandardMaterial({ color: '#cc3333', roughness: 0.5, metalness: 0.2 }),
};

const FIG_MATERIALS = [DM.figRed, DM.figGreen, DM.figBlue, DM.figOrange, DM.figPink];

function pickMaterial(id: string): THREE.MeshStandardMaterial {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return FIG_MATERIALS[Math.abs(hash) % FIG_MATERIALS.length];
}

// ── ActionFigure (boneco_desmontavel) ──

const ActionFigure = memo(function ActionFigure({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  const mat = useMemo(() => pickMaterial(deco.id), [deco.id]);
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.075, 0]} material={mat}>
        <capsuleGeometry args={[0.06, 0.15, 4, 8]} />
      </mesh>
      <mesh position={[0, 0.27, 0]} material={mat}>
        <sphereGeometry args={[0.06, 8, 8]} />
      </mesh>
    </group>
  );
});

// ── PopItToy (pop_it) ──

const PopItToy = memo(function PopItToy({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.015, 0]} material={DM.popPink}>
        <boxGeometry args={[0.2, 0.03, 0.15]} />
      </mesh>
      <mesh position={[-0.04, 0.035, -0.03]} material={DM.popPink}>
        <sphereGeometry args={[0.02, 6, 6]} />
      </mesh>
      <mesh position={[0.04, 0.035, -0.03]} material={DM.popPink}>
        <sphereGeometry args={[0.02, 6, 6]} />
      </mesh>
      <mesh position={[-0.04, 0.035, 0.03]} material={DM.popPink}>
        <sphereGeometry args={[0.02, 6, 6]} />
      </mesh>
      <mesh position={[0.04, 0.035, 0.03]} material={DM.popPink}>
        <sphereGeometry args={[0.02, 6, 6]} />
      </mesh>
    </group>
  );
});

// ── PlushToy (pelucia) ──

const PlushToy = memo(function PlushToy({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.1, 0]} material={DM.plushBrown}>
        <sphereGeometry args={[0.1, 8, 8]} />
      </mesh>
      <mesh position={[-0.07, 0.22, 0]} material={DM.plushBrown}>
        <sphereGeometry args={[0.04, 6, 6]} />
      </mesh>
      <mesh position={[0.07, 0.22, 0]} material={DM.plushBrown}>
        <sphereGeometry args={[0.04, 6, 6]} />
      </mesh>
    </group>
  );
});

// ── BuildingBlocks (blocos_montar) ──

const BuildingBlocks = memo(function BuildingBlocks({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.04, 0]} material={DM.blockRed}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
      </mesh>
      <mesh position={[0.02, 0.12, 0.01]} rotation={[0, 0.3, 0]} material={DM.blockBlue}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
      </mesh>
      <mesh position={[-0.01, 0.2, -0.01]} rotation={[0, -0.5, 0]} material={DM.blockYellow}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
      </mesh>
    </group>
  );
});

// ── Bookshelf (bookshelf) — tall shelf with book rows ──

const Bookshelf = memo(function Bookshelf({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.6, 0]} material={DM.woodDark}>
        <boxGeometry args={[0.6, 1.2, 0.2]} />
      </mesh>
      <mesh position={[0, 0.3, 0.01]} material={DM.woodShelf}>
        <boxGeometry args={[0.56, 0.02, 0.18]} />
      </mesh>
      <mesh position={[0, 0.7, 0.01]} material={DM.woodShelf}>
        <boxGeometry args={[0.56, 0.02, 0.18]} />
      </mesh>
      <mesh position={[-0.12, 0.15, 0.02]} material={DM.bookRed}>
        <boxGeometry args={[0.08, 0.24, 0.14]} />
      </mesh>
      <mesh position={[0, 0.14, 0.02]} material={DM.bookBlue}>
        <boxGeometry args={[0.07, 0.22, 0.14]} />
      </mesh>
      <mesh position={[0.1, 0.16, 0.02]} material={DM.bookGreen}>
        <boxGeometry args={[0.06, 0.26, 0.14]} />
      </mesh>
      <mesh position={[-0.1, 0.54, 0.02]} material={DM.bookPurple}>
        <boxGeometry args={[0.07, 0.22, 0.14]} />
      </mesh>
      <mesh position={[0.02, 0.52, 0.02]} material={DM.bookGold}>
        <boxGeometry args={[0.09, 0.18, 0.14]} />
      </mesh>
      <mesh position={[0.14, 0.55, 0.02]} material={DM.bookDark}>
        <boxGeometry args={[0.06, 0.24, 0.14]} />
      </mesh>
    </group>
  );
});

// ── BookStack (book_stack) — pile of books on the floor ──

const BookStack = memo(function BookStack({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.02, 0]} material={DM.bookBlue}>
        <boxGeometry args={[0.2, 0.04, 0.14]} />
      </mesh>
      <mesh position={[0.01, 0.06, -0.005]} rotation={[0, 0.15, 0]} material={DM.bookRed}>
        <boxGeometry args={[0.18, 0.04, 0.13]} />
      </mesh>
      <mesh position={[-0.01, 0.1, 0.005]} rotation={[0, -0.1, 0]} material={DM.bookGreen}>
        <boxGeometry args={[0.22, 0.04, 0.15]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[0, 0.25, 0]} material={DM.bookPurple}>
        <boxGeometry args={[0.17, 0.04, 0.12]} />
      </mesh>
    </group>
  );
});

// ── MedicalBed (medical_bed) — simple hospital bed ──

const MedicalBed = memo(function MedicalBed({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.2, 0]} material={DM.metalLight}>
        <boxGeometry args={[0.5, 0.06, 0.9]} />
      </mesh>
      <mesh position={[0, 0.26, 0]} material={DM.mattress}>
        <boxGeometry args={[0.46, 0.06, 0.86]} />
      </mesh>
      <mesh position={[0, 0.31, -0.32]} material={DM.pillow}>
        <boxGeometry args={[0.3, 0.06, 0.16]} />
      </mesh>
      {[[-0.22, -0.38], [0.22, -0.38], [-0.22, 0.38], [0.22, 0.38]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.09, lz]} material={DM.metalMed}>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.4, -0.44]} material={DM.headboard}>
        <boxGeometry args={[0.5, 0.3, 0.03]} />
      </mesh>
    </group>
  );
});

// ── IVStand (iv_stand) — IV drip pole ──

const IVStand = memo(function IVStand({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.02, 0]} material={DM.ivBase}>
        <boxGeometry args={[0.3, 0.02, 0.04]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={DM.ivBase}>
        <boxGeometry args={[0.04, 0.02, 0.3]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={DM.ivPole}>
        <cylinderGeometry args={[0.015, 0.015, 1.0, 6]} />
      </mesh>
      <mesh position={[0.06, 0.95, 0]} rotation={[0, 0, Math.PI / 4]} material={DM.ivPole}>
        <cylinderGeometry args={[0.008, 0.008, 0.12, 4]} />
      </mesh>
      <mesh position={[0.1, 0.85, 0]} material={DM.ivBag}>
        <boxGeometry args={[0.06, 0.1, 0.03]} />
      </mesh>
    </group>
  );
});

// ── MedicineCabinet (medicine_cabinet) — wall-style cabinet ──

const MedicineCabinet = memo(function MedicineCabinet({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      <mesh position={[0, 0.55, 0]} material={DM.cabinetBody}>
        <boxGeometry args={[0.4, 0.5, 0.15]} />
      </mesh>
      <mesh position={[0, 0.55, 0.076]} material={DM.cabinetCross}>
        <boxGeometry args={[0.06, 0.14, 0.005]} />
      </mesh>
      <mesh position={[0, 0.55, 0.076]} material={DM.cabinetCross}>
        <boxGeometry args={[0.14, 0.06, 0.005]} />
      </mesh>
      <mesh position={[0.14, 0.55, 0.08]} material={DM.metalMed}>
        <boxGeometry args={[0.02, 0.06, 0.02]} />
      </mesh>
    </group>
  );
});

// ── Dispatcher ──

function DecoVisual({ deco }: { deco: DecoObjectInfo }) {
  switch (deco.decoType) {
    case 'boneco_desmontavel':
      return <ActionFigure deco={deco} />;
    case 'pop_it':
      return <PopItToy deco={deco} />;
    case 'pelucia':
      return <PlushToy deco={deco} />;
    case 'blocos_montar':
      return <BuildingBlocks deco={deco} />;
    case 'bookshelf':
      return <Bookshelf deco={deco} />;
    case 'book_stack':
      return <BookStack deco={deco} />;
    case 'medical_bed':
      return <MedicalBed deco={deco} />;
    case 'iv_stand':
      return <IVStand deco={deco} />;
    case 'medicine_cabinet':
      return <MedicineCabinet deco={deco} />;
    default:
      return null;
  }
}

// ── Distance-based culling — only render decorations within range ──

const DECO_VISUAL_RANGE_SQ = 30 * 30;
const CULL_INTERVAL = 10;

// ── Main export ──

export function DecoObjects() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const [nearbyIds, setNearbyIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef('');
  const frameRef = useRef(0);

  const decorations = useMemo(() => {
    if (!mazeLayout || !mazeLayout.decorations || mazeLayout.decorations.length === 0) return null;
    return mazeLayout.decorations;
  }, [mazeLayout]);

  useFrame(() => {
    if (!decorations || ++frameRef.current % CULL_INTERVAL !== 0) return;
    const [px, , pz] = useGameStore.getState().localPosition;
    const ids: string[] = [];
    for (const deco of decorations) {
      const dx = deco.position[0] - px;
      const dz = deco.position[2] - pz;
      if (dx * dx + dz * dz < DECO_VISUAL_RANGE_SQ) {
        ids.push(deco.id);
      }
    }
    const key = ids.join(',');
    if (key !== prevIdsRef.current) {
      prevIdsRef.current = key;
      setNearbyIds(new Set(ids));
    }
  });

  if (!decorations) return null;

  return (
    <group>
      {decorations.map((deco) =>
        nearbyIds.has(deco.id) ? <DecoVisual key={deco.id} deco={deco} /> : null,
      )}
    </group>
  );
}
