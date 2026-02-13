import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../stores/game-store.js';
import type { MazeLayout } from '@shadow/shared';
import { MAP_HALF_EXTENT } from '@shadow/shared';

// ── Constants ──

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
const WORLD_SIZE = MAP_HALF_EXTENT * 2;
const HALF_WORLD = MAP_HALF_EXTENT;

// Viewport: world units visible from center to edge
const VIEW_RADIUS = 35;

// Internal resolution for the full-map static cache
const INTERNAL_SIZE = 2560;

// ── Colors ──

const BG_COLOR = 'rgba(6, 6, 14, 0.92)';
const ROOM_COLOR = '#14142a';
const ROOM_HIGHLIGHT = '#1c1c3a';
const WALL_COLOR = '#4a4a70';
const DYNAMIC_WALL_COLOR = '#3a4a5a';
const MURALHA_COLOR = '#ffaa00';
const ROOM_TEXT_COLOR = '#7878a0';
const PLAYER_COLOR_OUTLINE = '#ffffff';

// ── Helpers ──

/** Maps world coords to internal static-cache pixel coords */
function worldToCache(wx: number, wz: number): [number, number] {
  return [
    ((wx + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
    ((wz + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
  ];
}

// ── Static layer cache (renders full map at INTERNAL_SIZE) ──

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

  // Room names (auto-fit to cell width)
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

  // Static walls (borders + non-dynamic non-door)
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

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticCacheRef = useRef<HTMLCanvasElement | null>(null);
  const cachedLayoutRef = useRef<MazeLayout | null>(null);
  const rafRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  // M key hold to show/hide
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyM' && !visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyM') {
        visibleRef.current = false;
        setVisible(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Render loop (only runs while visible)
  useEffect(() => {
    if (!visible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 80;
    const maxDim = Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const displaySize = Math.max(300, maxDim);
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

      // Build static cache once (full map at INTERNAL_SIZE)
      if (mazeLayout !== cachedLayoutRef.current) {
        staticCacheRef.current = renderStaticLayer(mazeLayout);
        cachedLayoutRef.current = mazeLayout;
      }

      const px = localPosition[0];
      const pz = localPosition[2];
      const scale = canvasSize / (VIEW_RADIUS * 2); // canvas pixels per world unit
      const halfCanvas = canvasSize / 2;

      // ── Draw world (translated so player is at canvas center) ──
      ctx!.save();
      ctx!.translate(halfCanvas - px * scale, halfCanvas - pz * scale);

      // Static cache covers world [-HALF_WORLD..+HALF_WORLD]
      if (staticCacheRef.current) {
        ctx!.drawImage(
          staticCacheRef.current,
          -HALF_WORLD * scale,
          -HALF_WORLD * scale,
          WORLD_SIZE * scale,
          WORLD_SIZE * scale,
        );
      }

      // Dynamic / door walls
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

          ctx!.beginPath();
          ctx!.moveTo(wall.start[0] * scale, wall.start[1] * scale);
          ctx!.lineTo(wall.end[0] * scale, wall.end[1] * scale);
          ctx!.stroke();
        }

        // Muralha temporary walls
        if (mazeSnapshot.muralhaWalls.length > 0) {
          ctx!.strokeStyle = MURALHA_COLOR;
          ctx!.lineWidth = 4 * DPR;
          ctx!.lineCap = 'round';
          for (const mw of mazeSnapshot.muralhaWalls) {
            ctx!.beginPath();
            ctx!.moveTo(mw.start[0] * scale, mw.start[1] * scale);
            ctx!.lineTo(mw.end[0] * scale, mw.end[1] * scale);
            ctx!.stroke();
          }
        }
      }

      ctx!.restore();

      // ── Player indicator (always at canvas center) ──
      const [, qy, , qw] = localRotation;
      const yaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy));
      const playerSize = Math.max(10, Math.round(12 * DPR));
      const color = (localPlayerId && playerInfo[localPlayerId]?.color) || '#4ade80';

      // Pulsing glow
      ctx!.save();
      ctx!.globalAlpha = 0.25 + 0.15 * Math.sin(Date.now() * 0.004);
      ctx!.beginPath();
      ctx!.arc(halfCanvas, halfCanvas, playerSize * 1.8, 0, Math.PI * 2);
      ctx!.fillStyle = color;
      ctx!.fill();
      ctx!.restore();

      // Direction triangle
      ctx!.save();
      ctx!.translate(halfCanvas, halfCanvas);
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

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#8888bb',
          fontFamily: 'monospace',
          fontSize: 14,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        Station Map — [M]
      </div>

      {/* Map canvas */}
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 10,
          border: '1px solid #2a2a55',
          boxShadow: '0 0 40px rgba(100, 100, 200, 0.15)',
        }}
      />
    </div>
  );
}
