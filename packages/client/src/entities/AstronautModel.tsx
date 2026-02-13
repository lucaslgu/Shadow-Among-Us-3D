import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const MODEL_PATH = '/models/astronauta_t_pose_rig.glb';

// Model is ~0.95 units tall; scale to ~1.2 to match capsule hitbox
const MODEL_SCALE = 1.3;

export type AnimState = 'idle' | 'walk' | 'death' | 'ghost';

/** Mutable data object — updated by the parent in useFrame, read by AstronautModel */
export interface AstronautAnimData {
  animState: AnimState;
  speed: number;
  color: string;
  opacity: number;
  visible: boolean;
}

interface AstronautModelProps {
  /** Stable mutable ref — mutated by parent's useFrame, read here */
  data: AstronautAnimData;
}

/* ---------- reusable temp objects (safe — useFrame is synchronous) ---------- */
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _color = new THREE.Color();

/** Apply a procedural rotation on top of the rest-pose quaternion */
function rotateBone(
  bone: THREE.Bone | undefined,
  restQ: THREE.Quaternion | undefined,
  rx: number,
  ry: number,
  rz: number,
) {
  if (!bone || !restQ) return;
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  bone.quaternion.copy(restQ).multiply(_quat);
}

/* ---------- bones we animate ---------- */
const ANIM_BONES = [
  'Root_01', 'Hip_02', 'Pelvis_03',
  'L_Thigh_04', 'L_Calf_05', 'L_Foot_06',
  'R_Thigh_010', 'R_Calf_013', 'R_Foot_014',
  'Waist_017', 'Spine01_018', 'Spine02_019',
  'NeckTwist01_020', 'Head_022',
  'L_Clavicle_023', 'L_Upperarm_024', 'L_Forearm_025',
  'R_Clavicle_031', 'R_Upperarm_032', 'R_Forearm_035',
] as const;

/* ========================================================================== */
/*  Component                                                                  */
/* ========================================================================== */

export function AstronautModel({ data }: AstronautModelProps) {
  const gltf = useGLTF(MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null!);
  const timeRef = useRef(0);
  const deathElapsed = useRef(0);
  const prevAnim = useRef<AnimState>('idle');

  /* Clone scene so each player instance owns its own skeleton + materials */
  const { scene, bones, mats, rest } = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);

    const boneMap: Record<string, THREE.Bone> = {};
    cloned.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) boneMap[o.name] = o as THREE.Bone;
    });

    const matList: THREE.MeshStandardMaterial[] = [];
    cloned.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.material instanceof THREE.MeshStandardMaterial) {
          const mat = m.material.clone();
          m.material = mat;
          matList.push(mat);
        }
      }
    });

    // Snapshot rest-pose quaternions for animated bones
    const restMap: Record<string, THREE.Quaternion> = {};
    for (const name of ANIM_BONES) {
      if (boneMap[name]) restMap[name] = boneMap[name].quaternion.clone();
    }

    return { scene: cloned, bones: boneMap, mats: matList, rest: restMap };
  }, [gltf.scene]);

  /* Per-frame animation loop — reads from data (mutated by parent) */
  useFrame((_, delta) => {
    const { animState, speed, color, opacity, visible } = data;
    timeRef.current += delta;
    const t = timeRef.current;

    // Track death start
    if (animState === 'death' && prevAnim.current !== 'death') deathElapsed.current = 0;
    if (animState === 'death') deathElapsed.current += delta;
    prevAnim.current = animState;

    // Update material color + opacity
    _color.set(color);
    for (const mat of mats) {
      mat.color.copy(_color);
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
    }

    // Dispatch animation
    switch (animState) {
      case 'walk':  animWalk(bones, rest, t, speed); break;
      case 'death': animDeath(bones, rest, deathElapsed.current); break;
      case 'ghost': animGhost(bones, rest, t); break;
      default:      animIdle(bones, rest, t); break;
    }

    groupRef.current.visible = visible;
  });

  return (
    <group ref={groupRef} scale={MODEL_SCALE}>
      <primitive object={scene} />
    </group>
  );
}

/* ========================================================================== */
/*  Idle — subtle breathing & weight shift                                     */
/* ========================================================================== */

function animIdle(
  b: Record<string, THREE.Bone>,
  r: Record<string, THREE.Quaternion>,
  t: number,
) {
  const breathe = Math.sin(t * 1.5) * 0.015;
  rotateBone(b['Spine01_018'], r['Spine01_018'], breathe, 0, 0);
  rotateBone(b['Spine02_019'], r['Spine02_019'], breathe * 0.7, 0, 0);

  // Gentle lateral sway
  const sway = Math.sin(t * 0.7) * 0.01;
  rotateBone(b['Hip_02'], r['Hip_02'], 0, 0, sway);

  // Arms relaxed with tiny sway
  const arm = Math.sin(t * 0.9) * 0.02;
  rotateBone(b['L_Upperarm_024'], r['L_Upperarm_024'], arm, 0, 0);
  rotateBone(b['R_Upperarm_032'], r['R_Upperarm_032'], -arm, 0, 0);

  // Reset legs / head / forearms
  rotateBone(b['L_Thigh_04'], r['L_Thigh_04'], 0, 0, 0);
  rotateBone(b['R_Thigh_010'], r['R_Thigh_010'], 0, 0, 0);
  rotateBone(b['L_Calf_05'], r['L_Calf_05'], 0, 0, 0);
  rotateBone(b['R_Calf_013'], r['R_Calf_013'], 0, 0, 0);
  rotateBone(b['L_Forearm_025'], r['L_Forearm_025'], 0, 0, 0);
  rotateBone(b['R_Forearm_035'], r['R_Forearm_035'], 0, 0, 0);
  rotateBone(b['Head_022'], r['Head_022'], 0, 0, 0);
}

/* ========================================================================== */
/*  Walk — leg & arm swing, body bob, torso counter-rotation                   */
/* ========================================================================== */

function animWalk(
  b: Record<string, THREE.Bone>,
  r: Record<string, THREE.Quaternion>,
  t: number,
  speed: number,
) {
  // Cycle frequency scales with speed
  const freq = THREE.MathUtils.clamp(speed * 1.8, 3, 8);
  const phase = t * freq;
  const stride = Math.sin(phase);

  // Amplitude scales with speed
  const legAmp = THREE.MathUtils.clamp(speed * 0.12, 0.2, 0.5);

  // --- Thighs ---
  rotateBone(b['L_Thigh_04'], r['L_Thigh_04'], stride * legAmp, 0, 0);
  rotateBone(b['R_Thigh_010'], r['R_Thigh_010'], -stride * legAmp, 0, 0);

  // --- Knees (bend more during forward swing) ---
  const lKnee = Math.max(0, stride) * legAmp * 0.8;
  const rKnee = Math.max(0, -stride) * legAmp * 0.8;
  rotateBone(b['L_Calf_05'], r['L_Calf_05'], lKnee, 0, 0);
  rotateBone(b['R_Calf_013'], r['R_Calf_013'], rKnee, 0, 0);

  // --- Arms (opposite to legs) ---
  const armAmp = legAmp * 0.6;
  rotateBone(b['L_Upperarm_024'], r['L_Upperarm_024'], -stride * armAmp, 0, 0);
  rotateBone(b['R_Upperarm_032'], r['R_Upperarm_032'], stride * armAmp, 0, 0);

  // Forearm bends slightly during back-swing
  const lFore = Math.max(0, -stride) * armAmp * 0.4;
  const rFore = Math.max(0, stride) * armAmp * 0.4;
  rotateBone(b['L_Forearm_025'], r['L_Forearm_025'], lFore, 0, 0);
  rotateBone(b['R_Forearm_035'], r['R_Forearm_035'], rFore, 0, 0);

  // --- Body bob (double frequency) ---
  const bob = Math.abs(Math.sin(phase)) * 0.01;
  rotateBone(b['Spine01_018'], r['Spine01_018'], bob, 0, 0);

  // --- Torso counter-rotation ---
  const torso = stride * 0.04;
  rotateBone(b['Spine02_019'], r['Spine02_019'], 0, torso, 0);

  // --- Head stabilization ---
  rotateBone(b['Head_022'], r['Head_022'], 0, -torso * 0.3, 0);

  // --- Hip sway ---
  rotateBone(b['Hip_02'], r['Hip_02'], 0, 0, stride * 0.02);
}

/* ========================================================================== */
/*  Death — fall backward over ~0.8s                                           */
/* ========================================================================== */

function animDeath(
  b: Record<string, THREE.Bone>,
  r: Record<string, THREE.Quaternion>,
  elapsed: number,
) {
  const progress = Math.min(elapsed / 0.8, 1);
  const ease = progress * progress; // ease-in (accelerating)

  // Whole body tilts back via hip
  rotateBone(b['Hip_02'], r['Hip_02'], ease * (Math.PI * 0.5), 0, 0);

  // Arms flail outward
  const flail = ease * 0.8;
  rotateBone(b['L_Upperarm_024'], r['L_Upperarm_024'], flail, 0, -flail * 0.5);
  rotateBone(b['R_Upperarm_032'], r['R_Upperarm_032'], flail, 0, flail * 0.5);

  // Head drops back
  rotateBone(b['Head_022'], r['Head_022'], ease * 0.3, 0, 0);

  // Knees buckle
  const knee = ease * 0.4;
  rotateBone(b['L_Calf_05'], r['L_Calf_05'], knee, 0, 0);
  rotateBone(b['R_Calf_013'], r['R_Calf_013'], knee, 0, 0);

  // Spine curves
  rotateBone(b['Spine01_018'], r['Spine01_018'], ease * 0.15, 0, 0);
  rotateBone(b['Spine02_019'], r['Spine02_019'], ease * 0.1, 0, 0);

  // Reset thighs / forearms
  rotateBone(b['L_Thigh_04'], r['L_Thigh_04'], 0, 0, 0);
  rotateBone(b['R_Thigh_010'], r['R_Thigh_010'], 0, 0, 0);
  rotateBone(b['L_Forearm_025'], r['L_Forearm_025'], 0, 0, 0);
  rotateBone(b['R_Forearm_035'], r['R_Forearm_035'], 0, 0, 0);
}

/* ========================================================================== */
/*  Ghost — ethereal floating sway                                             */
/* ========================================================================== */

function animGhost(
  b: Record<string, THREE.Bone>,
  r: Record<string, THREE.Quaternion>,
  t: number,
) {
  // Floating body sway
  const floatX = Math.sin(t * 1.2) * 0.03;
  const floatZ = Math.sin(t * 0.8) * 0.02;
  rotateBone(b['Hip_02'], r['Hip_02'], floatX, 0, floatZ);

  // Arms drift outward/upward
  const armDrift = Math.sin(t * 0.9) * 0.1 + 0.15;
  rotateBone(b['L_Upperarm_024'], r['L_Upperarm_024'], armDrift, 0, -0.2);
  rotateBone(b['R_Upperarm_032'], r['R_Upperarm_032'], armDrift, 0, 0.2);
  rotateBone(b['L_Forearm_025'], r['L_Forearm_025'], 0.1, 0, 0);
  rotateBone(b['R_Forearm_035'], r['R_Forearm_035'], 0.1, 0, 0);

  // Head tilts gently
  const headTilt = Math.sin(t * 0.6) * 0.05;
  rotateBone(b['Head_022'], r['Head_022'], headTilt, 0, headTilt * 0.5);

  // Legs relax slightly forward
  rotateBone(b['L_Thigh_04'], r['L_Thigh_04'], 0.1, 0, 0);
  rotateBone(b['R_Thigh_010'], r['R_Thigh_010'], 0.1, 0, 0);
  rotateBone(b['L_Calf_05'], r['L_Calf_05'], 0.05, 0, 0);
  rotateBone(b['R_Calf_013'], r['R_Calf_013'], 0.05, 0, 0);

  // Spine gentle curve
  rotateBone(b['Spine01_018'], r['Spine01_018'], Math.sin(t) * 0.02, 0, 0);
  rotateBone(b['Spine02_019'], r['Spine02_019'], Math.sin(t * 1.1) * 0.02, 0, 0);
}

/* ---------- Preload model for faster first render ---------- */
useGLTF.preload(MODEL_PATH);
