import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { MAP_HALF_EXTENT } from '@shadow/shared';
import type { MazeLayout } from '@shadow/shared';
import { playTeleport } from '../audio/sound-manager.js';
import * as s from './styles.js';

// ── Constants ──

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
const WORLD_SIZE = MAP_HALF_EXTENT * 2;
const HALF_WORLD = MAP_HALF_EXTENT;
const INTERNAL_SIZE = 2560;

// ── Colors ──

const BG_COLOR = 'rgba(6, 6, 14, 0.95)';
const ROOM_COLOR = '#14142a';
const ROOM_HIGHLIGHT = '#1c1c3a';
const WALL_COLOR = '#4a4a70';
const DYNAMIC_WALL_COLOR = '#3a4a5a';
const MURALHA_COLOR = '#ffaa00';
const ROOM_TEXT_COLOR = '#7878a0';
const PLAYER_COLOR_OUTLINE = '#ffffff';
const TELEPORT_CURSOR_COLOR = '#6d28d9';
const TELEPORT_CURSOR_GLOW = 'rgba(109, 40, 217, 0.4)';

// ── Helpers ──

function worldToCache(wx: number, wz: number): [number, number] {
  return [
    ((wx + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
    ((wz + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
  ];
}

// ── Static layer cache ──

function renderStaticLayer(layout: MazeLayout): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = INTERNAL_SIZE;
  canvas.height = INTERNAL_SIZE;
  const ctx = canvas.getContext('2d')!;
  const scale = INTERNAL_SIZE / WORLD_SIZE;
  const cellPx = layout.cellSize * scale;
  const wallWidth = Math.max(2, 3);
  const fontSize = Math.max(14, Math.round(16));

  // Room fills
  for (const room of layout.rooms) {
    const [rx, rz] = worldToCache(
      room.position[0] - layout.cellSize / 2,
      room.position[2] - layout.cellSize / 2,
    );
    ctx.fillStyle = ROOM_COLOR;
    ctx.fillRect(rx, rz, cellPx, cellPx);
    const inset = 3;
    ctx.fillStyle = ROOM_HIGHLIGHT;
    ctx.fillRect(rx + inset, rz + inset, cellPx - inset * 2, cellPx - inset * 2);
  }

  // Room names
  ctx.fillStyle = ROOM_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxTextWidth = cellPx * 0.85;
  for (const room of layout.rooms) {
    const [rx, rz] = worldToCache(room.position[0], room.position[2]);
    let fs = fontSize;
    ctx.font = `bold ${fs}px monospace`;
    while (fs > 8 && ctx.measureText(room.name).width > maxTextWidth) {
      fs--;
      ctx.font = `bold ${fs}px monospace`;
    }
    ctx.fillText(room.name, rx, rz);
  }

  // Static walls
  ctx.strokeStyle = WALL_COLOR;
  ctx.lineWidth = wallWidth;
  ctx.lineCap = 'round';
  for (const wall of layout.walls) {
    if (wall.isDynamic || wall.hasDoor) continue;
    const [sx, sz] = worldToCache(wall.start[0], wall.start[1]);
    const [ex, ez] = worldToCache(wall.end[0], wall.end[1]);
    ctx.beginPath();
    ctx.moveTo(sx, sz);
    ctx.lineTo(ex, ez);
    ctx.stroke();
  }

  return canvas;
}

// ── Component ──

export function TeleportMapOverlay() {
  const teleportMapOpen = useGameStore((st) => st.teleportMapOpen);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticCacheRef = useRef<HTMLCanvasElement | null>(null);
  const cachedLayoutRef = useRef<MazeLayout | null>(null);
  const rafRef = useRef(0);
  const mouseWorldRef = useRef<[number, number] | null>(null);

  // Draw loop
  useEffect(() => {
    if (!teleportMapOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 60;
    const maxDim = Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const displaySize = Math.max(400, maxDim);
    const canvasSize = Math.round(displaySize * DPR);

    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    staticCacheRef.current = null;
    cachedLayoutRef.current = null;

    function draw() {
      const state = useGameStore.getState();
      const { mazeLayout, mazeSnapshot, localPosition, localRotation, localPlayerId, playerInfo } = state;

      ctx!.clearRect(0, 0, canvasSize, canvasSize);
      ctx!.fillStyle = BG_COLOR;
      ctx!.fillRect(0, 0, canvasSize, canvasSize);

      if (!mazeLayout) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Build static cache
      if (mazeLayout !== cachedLayoutRef.current) {
        staticCacheRef.current = renderStaticLayer(mazeLayout);
        cachedLayoutRef.current = mazeLayout;
      }

      const scale = canvasSize / WORLD_SIZE;

      // ── Draw full map (centered, showing entire world) ──
      ctx!.save();
      ctx!.translate(canvasSize / 2, canvasSize / 2);
      ctx!.translate(-HALF_WORLD * scale, -HALF_WORLD * scale);

      // Static layer
      if (staticCacheRef.current) {
        ctx!.drawImage(staticCacheRef.current, 0, 0, WORLD_SIZE * scale, WORLD_SIZE * scale);
      }

      // Dynamic walls
      if (mazeSnapshot) {
        const wallWidth = Math.max(2, 3 * DPR);
        ctx!.strokeStyle = DYNAMIC_WALL_COLOR;
        ctx!.lineWidth = wallWidth;
        ctx!.lineCap = 'round';
        for (const wall of mazeLayout.walls) {
          if (!wall.isDynamic && !wall.hasDoor) continue;
          if (wall.isDynamic) {
            if (mazeSnapshot.dynamicWallStates[wall.id] === false) continue;
          }
          if (wall.hasDoor && wall.doorId) {
            const ds = mazeSnapshot.doorStates[wall.doorId];
            if (ds?.isOpen && !ds.isLocked) continue;
          }
          const wx1 = (wall.start[0] + HALF_WORLD) * scale;
          const wz1 = (wall.start[1] + HALF_WORLD) * scale;
          const wx2 = (wall.end[0] + HALF_WORLD) * scale;
          const wz2 = (wall.end[1] + HALF_WORLD) * scale;
          ctx!.beginPath();
          ctx!.moveTo(wx1, wz1);
          ctx!.lineTo(wx2, wz2);
          ctx!.stroke();
        }

        // Muralha walls
        if (mazeSnapshot.muralhaWalls.length > 0) {
          ctx!.strokeStyle = MURALHA_COLOR;
          ctx!.lineWidth = 4 * DPR;
          for (const mw of mazeSnapshot.muralhaWalls) {
            const mx1 = (mw.start[0] + HALF_WORLD) * scale;
            const mz1 = (mw.start[1] + HALF_WORLD) * scale;
            const mx2 = (mw.end[0] + HALF_WORLD) * scale;
            const mz2 = (mw.end[1] + HALF_WORLD) * scale;
            ctx!.beginPath();
            ctx!.moveTo(mx1, mz1);
            ctx!.lineTo(mx2, mz2);
            ctx!.stroke();
          }
        }
      }

      // Player position indicator
      const px = localPosition[0];
      const pz = localPosition[2];
      const playerCanvasX = (px + HALF_WORLD) * scale;
      const playerCanvasZ = (pz + HALF_WORLD) * scale;
      const [, qy, , qw] = localRotation;
      const yaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy));
      const playerSize = Math.max(8, Math.round(10 * DPR));
      const color = (localPlayerId && playerInfo[localPlayerId]?.color) || '#4ade80';

      // Glow
      ctx!.save();
      ctx!.globalAlpha = 0.3;
      ctx!.beginPath();
      ctx!.arc(playerCanvasX, playerCanvasZ, playerSize * 2, 0, Math.PI * 2);
      ctx!.fillStyle = color;
      ctx!.fill();
      ctx!.restore();

      // Direction triangle
      ctx!.save();
      ctx!.translate(playerCanvasX, playerCanvasZ);
      ctx!.rotate(-yaw);
      ctx!.beginPath();
      ctx!.moveTo(0, -playerSize);
      ctx!.lineTo(-playerSize * 0.6, playerSize * 0.5);
      ctx!.lineTo(playerSize * 0.6, playerSize * 0.5);
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();
      ctx!.strokeStyle = PLAYER_COLOR_OUTLINE;
      ctx!.lineWidth = 2 * DPR;
      ctx!.stroke();
      ctx!.restore();

      ctx!.restore();

      // ── Teleport cursor (mouse hover position) ──
      const mw = mouseWorldRef.current;
      if (mw) {
        const cursorX = canvasSize / 2 + (mw[0]) * scale;
        const cursorZ = canvasSize / 2 + (mw[1]) * scale;
        const cursorSize = Math.max(6, 8 * DPR);

        // Outer glow
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cursorX, cursorZ, cursorSize * 2.5, 0, Math.PI * 2);
        ctx!.fillStyle = TELEPORT_CURSOR_GLOW;
        ctx!.fill();
        ctx!.restore();

        // Crosshair
        ctx!.strokeStyle = TELEPORT_CURSOR_COLOR;
        ctx!.lineWidth = 2 * DPR;
        ctx!.beginPath();
        ctx!.moveTo(cursorX - cursorSize, cursorZ);
        ctx!.lineTo(cursorX + cursorSize, cursorZ);
        ctx!.moveTo(cursorX, cursorZ - cursorSize);
        ctx!.lineTo(cursorX, cursorZ + cursorSize);
        ctx!.stroke();

        // Center dot
        ctx!.beginPath();
        ctx!.arc(cursorX, cursorZ, 3 * DPR, 0, Math.PI * 2);
        ctx!.fillStyle = TELEPORT_CURSOR_COLOR;
        ctx!.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [teleportMapOpen]);

  // Mouse tracking (converts canvas coords to world coords)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const displaySize = rect.width;
    // Map from display coords to world coords
    const worldX = (x / displaySize - 0.5) * WORLD_SIZE;
    const worldZ = (y / displaySize - 0.5) * WORLD_SIZE;
    mouseWorldRef.current = [worldX, worldZ];
  }, []);

  // Click to teleport
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const displaySize = rect.width;
    const worldX = (x / displaySize - 0.5) * WORLD_SIZE;
    const worldZ = (y / displaySize - 0.5) * WORLD_SIZE;

    // Clamp to map bounds
    const clampedX = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, worldX));
    const clampedZ = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, worldZ));

    const socket = useNetworkStore.getState().socket;
    if (socket) {
      playTeleport();
      socket.emit('power:activate', { teleportPosition: [clampedX, clampedZ] });
    }

    useGameStore.getState().closeTeleportMap();
  }, []);

  // ESC / Q to close
  useEffect(() => {
    if (!teleportMapOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        useGameStore.getState().closeTeleportMap();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [teleportMapOpen]);

  if (!teleportMapOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 35,
      }}
    >
      {/* Title */}
      <div
        style={{
          color: TELEPORT_CURSOR_COLOR,
          fontFamily: 'monospace',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        TELEPORT — Clique no destino
      </div>

      {/* Charges info */}
      <TeleportChargesInfo />

      {/* Map canvas (clickable) */}
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 10,
          border: `2px solid ${s.colors.primary}`,
          boxShadow: `0 0 40px rgba(109, 40, 217, 0.25)`,
          cursor: 'crosshair',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />

      {/* Instructions */}
      <div
        style={{
          color: s.colors.textMuted,
          fontFamily: 'monospace',
          fontSize: 12,
          marginTop: 10,
          letterSpacing: 1,
        }}
      >
        [ESC] ou [Q] para cancelar
      </div>
    </div>
  );
}

function TeleportChargesInfo() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);

  const mySnap = localPlayerId ? players[localPlayerId] : null;
  const charges = mySnap?.powerUsesLeft ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        marginBottom: 10,
        alignItems: 'center',
      }}
    >
      <span style={{ color: s.colors.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
        Cargas:
      </span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${s.colors.primary}`,
            background: i < charges ? s.colors.primary : 'transparent',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}
