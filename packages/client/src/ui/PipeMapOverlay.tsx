import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useGameStore } from '../stores/game-store.js';
import type { PipeNode } from '@shadow/shared';

// ── Constants ──

const PIPE_GREEN = '#00ff88';
const PIPE_GREEN_DIM = '#00aa55';
const BG_COLOR = 'rgba(4, 12, 6, 0.92)';
const NODE_RADIUS = 24;
const PLAYER_MARKER_RADIUS = 8;
const CONNECTION_WIDTH = 4;

/**
 * PipeMapOverlay — fullscreen pipe network schematic toggled by holding M.
 * Shows current position and exit locations as a navigation aid.
 */
export function PipeMapOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  const isUnderground = useGameStore((st) => {
    const id = st.localPlayerId;
    if (!id) return false;
    return st.players[id]?.isUnderground ?? false;
  });
  const mazeLayout = useGameStore((st) => st.mazeLayout);

  const pipeNodes = mazeLayout?.pipeNodes;
  const pipeConnections = mazeLayout?.pipeConnections;

  // M key hold-to-show (only when underground)
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

  // Auto-hide when returning to surface
  useEffect(() => {
    if (!isUnderground) {
      visibleRef.current = false;
      setVisible(false);
    }
  }, [isUnderground]);

  // Pre-compute bounding box and projection for the node positions
  const projection = useMemo(() => {
    if (!pipeNodes || pipeNodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of pipeNodes) {
      const [x, , z] = n.undergroundPosition;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    return { minX, maxX, minZ, maxZ, rangeX, rangeZ };
  }, [pipeNodes]);

  // Map world position (x, z) to canvas pixel position
  const worldToCanvas = useCallback((wx: number, wz: number, canvasW: number, canvasH: number) => {
    if (!projection) return { cx: 0, cy: 0 };
    const { minX, minZ, rangeX, rangeZ } = projection;
    // Keep aspect ratio: fit the larger range and center the smaller one
    const maxRange = Math.max(rangeX, rangeZ);
    const padding = 80;
    const drawSize = Math.min(canvasW, canvasH) - padding * 2;
    const offsetX = (canvasW - drawSize) / 2;
    const offsetY = (canvasH - drawSize) / 2;
    return {
      cx: offsetX + ((wx - minX) / maxRange) * drawSize + (maxRange - rangeX) / maxRange * drawSize / 2,
      cy: offsetY + ((wz - minZ) / maxRange) * drawSize + (maxRange - rangeZ) / maxRange * drawSize / 2,
    };
  }, [projection]);

  // Map node to canvas pixel position
  const nodeToCanvas = useCallback((node: PipeNode, canvasW: number, canvasH: number) => {
    const [x, , z] = node.undergroundPosition;
    return worldToCanvas(x, z, canvasW, canvasH);
  }, [worldToCanvas]);

  // Render loop
  useEffect(() => {
    if (!visible || !isUnderground || !pipeNodes || !pipeConnections || !projection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fullscreen sizing
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mapSize = Math.min(vw, vh) * 0.85;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = mapSize * dpr;
    canvas.height = mapSize * dpr;
    canvas.style.width = `${mapSize}px`;
    canvas.style.height = `${mapSize}px`;

    const cw = canvas.width;
    const ch = canvas.height;

    function draw() {
      const state = useGameStore.getState();
      const myId = state.localPlayerId;
      const myS = myId ? state.players[myId] : null;
      const currentNodeId = myS?.currentPipeNodeId;

      ctx!.clearRect(0, 0, cw, ch);

      // Background
      ctx!.fillStyle = BG_COLOR;
      ctx!.beginPath();
      ctx!.roundRect(0, 0, cw, ch, 16 * dpr);
      ctx!.fill();

      // Border
      ctx!.strokeStyle = PIPE_GREEN_DIM;
      ctx!.lineWidth = 2 * dpr;
      ctx!.beginPath();
      ctx!.roundRect(0, 0, cw, ch, 16 * dpr);
      ctx!.stroke();

      // Scan line effect (subtle horizontal lines)
      ctx!.strokeStyle = 'rgba(0, 255, 136, 0.03)';
      ctx!.lineWidth = 1;
      for (let y = 0; y < ch; y += 4 * dpr) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(cw, y);
        ctx!.stroke();
      }

      // Title
      ctx!.fillStyle = PIPE_GREEN;
      ctx!.font = `bold ${16 * dpr}px 'Courier New', monospace`;
      ctx!.textAlign = 'center';
      ctx!.fillText('REDE DE TÚNEIS', cw / 2, 30 * dpr);

      // Subtitle
      ctx!.fillStyle = PIPE_GREEN_DIM;
      ctx!.font = `${10 * dpr}px 'Courier New', monospace`;
      ctx!.fillText('Caminhe até uma saída | E para subir | Solte M para fechar', cw / 2, 46 * dpr);

      // Draw connections (thick tunnel lines)
      for (const conn of pipeConnections!) {
        const nodeA = pipeNodes!.find(n => n.id === conn.nodeA);
        const nodeB = pipeNodes!.find(n => n.id === conn.nodeB);
        if (!nodeA || !nodeB) continue;
        const a = nodeToCanvas(nodeA, cw, ch);
        const b = nodeToCanvas(nodeB, cw, ch);

        // Tunnel outline (darker, thicker)
        ctx!.strokeStyle = 'rgba(0, 100, 50, 0.6)';
        ctx!.lineWidth = (CONNECTION_WIDTH + 4) * dpr;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(a.cx, a.cy);
        ctx!.lineTo(b.cx, b.cy);
        ctx!.stroke();

        // Tunnel fill
        ctx!.strokeStyle = 'rgba(0, 170, 85, 0.35)';
        ctx!.lineWidth = CONNECTION_WIDTH * dpr;
        ctx!.beginPath();
        ctx!.moveTo(a.cx, a.cy);
        ctx!.lineTo(b.cx, b.cy);
        ctx!.stroke();
      }

      // Draw nodes
      for (const node of pipeNodes!) {
        const { cx, cy } = nodeToCanvas(node, cw, ch);
        const isCurrent = node.id === currentNodeId;
        const r = NODE_RADIUS * dpr / 2;

        // Glow for current node
        if (isCurrent) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
          ctx!.fillStyle = 'rgba(0, 255, 136, 0.15)';
          ctx!.fill();
          ctx!.restore();
        }

        // Node circle
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.fillStyle = isCurrent ? '#0a3a1a' : '#0a1a10';
        ctx!.fill();
        ctx!.strokeStyle = isCurrent ? PIPE_GREEN : PIPE_GREEN_DIM;
        ctx!.lineWidth = (isCurrent ? 2.5 : 1.5) * dpr;
        ctx!.stroke();

        // Exit arrow (small upward arrow icon inside node)
        ctx!.fillStyle = isCurrent ? PIPE_GREEN : PIPE_GREEN_DIM;
        ctx!.font = `${10 * dpr}px 'Courier New', monospace`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText('\u2191', cx, cy); // ↑ arrow

        // Room name label
        ctx!.fillStyle = isCurrent ? '#ffffff' : PIPE_GREEN;
        ctx!.font = `${9 * dpr}px 'Courier New', monospace`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'top';
        ctx!.fillText(node.roomName, cx, cy + r + 4 * dpr);
      }

      // Draw player position marker (real-time from localPosition)
      const localPos = state.localPosition;
      const { cx: plrCx, cy: plrCy } = worldToCanvas(localPos[0], localPos[2], cw, ch);
      const plrR = PLAYER_MARKER_RADIUS * dpr;

      // Pulsing glow
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(plrCx, plrCy, plrR * 3.5, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(0, 255, 136, ${0.12 * pulse})`;
      ctx!.fill();
      ctx!.restore();

      // Player dot
      ctx!.beginPath();
      ctx!.arc(plrCx, plrCy, plrR, 0, Math.PI * 2);
      ctx!.fillStyle = PIPE_GREEN;
      ctx!.fill();
      ctx!.strokeStyle = '#ffffff';
      ctx!.lineWidth = 2 * dpr;
      ctx!.stroke();

      // "VOCÊ" label
      ctx!.fillStyle = '#ffffff';
      ctx!.font = `bold ${9 * dpr}px 'Courier New', monospace`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'bottom';
      ctx!.fillText('VOCÊ', plrCx, plrCy - plrR - 3 * dpr);

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, isUnderground, pipeNodes, pipeConnections, projection, nodeToCanvas, worldToCanvas]);

  if (!visible || !isUnderground || !pipeNodes || pipeNodes.length === 0 || !pipeConnections) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      pointerEvents: 'none',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 16,
          boxShadow: '0 0 60px rgba(0, 255, 136, 0.2), 0 0 120px rgba(0, 255, 136, 0.08)',
        }}
      />
    </div>
  );
}
