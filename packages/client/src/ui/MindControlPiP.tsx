import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { PowerType } from '@shadow/shared';

const PIP_WIDTH = 384;
const PIP_HEIGHT = 216;
const EYE_HEIGHT = 1.2;

// Reusable vectors (avoid GC per frame)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function MindControlPiP() {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const borderRef = useRef<THREE.Mesh>(null);

  const pipCamera = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(60, PIP_WIDTH / PIP_HEIGHT, 0.1, 500);
    cam.layers.set(0); // Only render layer 0 (excludes PiP meshes)
    return cam;
  }, []);

  const rt = useMemo(() => {
    return new THREE.WebGLRenderTarget(PIP_WIDTH, PIP_HEIGHT, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, []);

  // Put PiP meshes on layer 1 so they don't appear in the PiP camera's render
  useEffect(() => {
    if (meshRef.current) meshRef.current.layers.set(1);
    if (borderRef.current) borderRef.current.layers.set(1);
    // Main camera needs to see layer 1
    camera.layers.enable(1);
    return () => {
      rt.dispose();
    };
  }, [camera, rt]);

  useFrame(({ gl, scene }) => {
    const state = useGameStore.getState();
    const myId = state.localPlayerId;
    const mySnap = myId ? state.players[myId] : null;
    const targetId = mySnap?.mindControlTargetId;

    // Only render when mind control is active
    const active = !!(
      mySnap?.powerActive &&
      targetId &&
      state.localPower === PowerType.MIND_CONTROLLER
    );

    if (meshRef.current) meshRef.current.visible = active;
    if (borderRef.current) borderRef.current.visible = active;
    if (!active || !targetId) return;

    const targetSnap = state.players[targetId];
    if (!targetSnap) return;

    // Position PiP camera at the controlled player's head
    pipCamera.position.set(
      targetSnap.position[0],
      targetSnap.position[1] + EYE_HEIGHT,
      targetSnap.position[2],
    );
    _q.set(
      targetSnap.rotation[0],
      targetSnap.rotation[1],
      targetSnap.rotation[2],
      targetSnap.rotation[3],
    );
    pipCamera.quaternion.copy(_q);

    // Render scene to the render target
    const currentRT = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, pipCamera);
    gl.setRenderTarget(currentRT);

    // Position PiP mesh at bottom-right of screen (billboard facing camera)
    const cam = camera as THREE.PerspectiveCamera;
    const dist = 1.0;
    const halfFov = (cam.fov * Math.PI / 180) / 2;
    const halfH = Math.tan(halfFov) * dist;
    const halfW = halfH * cam.aspect;

    // PiP = 28% of screen width, 16:9 aspect
    const pipW = halfW * 0.56;
    const pipH = pipW * (9 / 16);
    const pad = halfW * 0.04;

    // Camera basis vectors
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);

    // PiP center: bottom-right corner
    _center.copy(cam.position)
      .addScaledVector(_fwd, dist)
      .addScaledVector(_right, halfW - pipW / 2 - pad)
      .addScaledVector(_up, -halfH + pipH / 2 + pad);

    // Viewport mesh
    meshRef.current!.position.copy(_center);
    meshRef.current!.quaternion.copy(cam.quaternion);
    meshRef.current!.scale.set(pipW, pipH, 1);

    // Border mesh (slightly larger, behind viewport)
    const borderPad = pipW * 0.02;
    borderRef.current!.position.copy(_center).addScaledVector(_fwd, -0.001);
    borderRef.current!.quaternion.copy(cam.quaternion);
    borderRef.current!.scale.set(pipW + borderPad, pipH + borderPad, 1);
  }, -1); // priority -1: render RT before the main render

  return (
    <>
      {/* Border */}
      <mesh ref={borderRef} renderOrder={998} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#ff8800"
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Viewport */}
      <mesh ref={meshRef} renderOrder={999} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={rt.texture}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
