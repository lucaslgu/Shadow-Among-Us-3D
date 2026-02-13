import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import type { PipeNode, PipeConnection } from '@shadow/shared';

// ── Constants ──

const PIPE_GREEN = '#00ff88';
const PIPE_GREEN_DIM = '#00aa55';
const PIPE_GREEN_GLOW = 'rgba(0, 255, 136, 0.25)';
const BG_COLOR = 'rgba(4, 12, 6, 0.95)';
const NODE_RADIUS = 18;
const HOVER_RADIUS = 24;

/**
 * PipeMapOverlay — shows the underground pipe network schematic when
 * the local player is underground. Clicking a node fast-travels there.
 * Press E at a node to exit to the surface.
 */
export function PipeMapOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hoveredNodeRef = useRef<string | null>(null);

  // Subscribe to underground state
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const mazeLayout = useGameStore((st) => st.mazeLayout);

  const mySnap = localPlayerId ? players[localPlayerId] : null;
  const isUnderground = mySnap?.isUnderground ?? false;

  const pipeNodes = mazeLayout?.pipeNodes;
  const pipeConnections = mazeLayout?.pipeConnections;

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
    const padding = 60;

    return { minX, maxX, minZ, maxZ, rangeX, rangeZ, padding };
  }, [pipeNodes]);

  // Map node world position to canvas pixel position
  const nodeToCanvas = useCallback((node: PipeNode, canvasW: number, canvasH: number) => {
    if (!projection) return { cx: 0, cy: 0 };
    const { minX, minZ, rangeX, rangeZ, padding } = projection;
    const drawW = canvasW - padding * 2;
    const drawH = canvasH - padding * 2;
    const [x, , z] = node.undergroundPosition;
    return {
      cx: padding + ((x - minX) / rangeX) * drawW,
      cy: padding + ((z - minZ) / rangeZ) * drawH,
    };
  }, [projection]);

  // Render loop
  useEffect(() => {
    if (!isUnderground || !pipeNodes || !pipeConnections || !projection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 400;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

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
      ctx!.roundRect(0, 0, cw, ch, 12 * dpr);
      ctx!.fill();

      // Border
      ctx!.strokeStyle = PIPE_GREEN_DIM;
      ctx!.lineWidth = 2 * dpr;
      ctx!.beginPath();
      ctx!.roundRect(0, 0, cw, ch, 12 * dpr);
      ctx!.stroke();

      // Title
      ctx!.fillStyle = PIPE_GREEN;
      ctx!.font = `bold ${12 * dpr}px 'Courier New', monospace`;
      ctx!.textAlign = 'center';
      ctx!.fillText('PIPE NETWORK', cw / 2, 22 * dpr);

      // Subtitle
      ctx!.fillStyle = PIPE_GREEN_DIM;
      ctx!.font = `${9 * dpr}px 'Courier New', monospace`;
      ctx!.fillText('Click to travel | E to exit', cw / 2, 36 * dpr);

      // Draw connections
      ctx!.strokeStyle = PIPE_GREEN_DIM;
      ctx!.lineWidth = 2 * dpr;
      for (const conn of pipeConnections!) {
        const nodeA = pipeNodes!.find(n => n.id === conn.nodeA);
        const nodeB = pipeNodes!.find(n => n.id === conn.nodeB);
        if (!nodeA || !nodeB) continue;
        const a = nodeToCanvas(nodeA, cw, ch);
        const b = nodeToCanvas(nodeB, cw, ch);
        ctx!.beginPath();
        ctx!.moveTo(a.cx, a.cy);
        ctx!.lineTo(b.cx, b.cy);
        ctx!.stroke();
      }

      // Draw nodes
      const hovered = hoveredNodeRef.current;
      for (const node of pipeNodes!) {
        const { cx, cy } = nodeToCanvas(node, cw, ch);
        const isCurrent = node.id === currentNodeId;
        const isHovered = node.id === hovered;
        const r = (isHovered ? HOVER_RADIUS : NODE_RADIUS) * dpr / 2;

        // Glow for current or hovered
        if (isCurrent || isHovered) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(cx, cy, r * 2, 0, Math.PI * 2);
          ctx!.fillStyle = isCurrent ? 'rgba(0, 255, 136, 0.3)' : PIPE_GREEN_GLOW;
          ctx!.fill();
          ctx!.restore();
        }

        // Node circle
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.fillStyle = isCurrent ? PIPE_GREEN : '#0a2a15';
        ctx!.fill();
        ctx!.strokeStyle = isCurrent ? '#ffffff' : PIPE_GREEN_DIM;
        ctx!.lineWidth = (isCurrent ? 2.5 : 1.5) * dpr;
        ctx!.stroke();

        // Room name label
        ctx!.fillStyle = isCurrent ? '#ffffff' : PIPE_GREEN;
        ctx!.font = `${(isHovered ? 10 : 9) * dpr}px 'Courier New', monospace`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'top';
        ctx!.fillText(node.roomName, cx, cy + r + 4 * dpr);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isUnderground, pipeNodes, pipeConnections, projection, nodeToCanvas]);

  // Mouse hover tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pipeNodes) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const cw = canvas.width;
    const ch = canvas.height;
    const hitR = HOVER_RADIUS * dpr / 2;

    let found: string | null = null;
    for (const node of pipeNodes) {
      const { cx, cy } = nodeToCanvas(node, cw, ch);
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy < hitR * hitR) {
        found = node.id;
        break;
      }
    }
    hoveredNodeRef.current = found;
  }, [pipeNodes, nodeToCanvas]);

  // Click to travel
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pipeNodes) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;
    const cw = canvas.width;
    const ch = canvas.height;
    const hitR = HOVER_RADIUS * dpr / 2;

    for (const node of pipeNodes) {
      const { cx, cy } = nodeToCanvas(node, cw, ch);
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy < hitR * hitR) {
        // Don't travel to current node
        const state = useGameStore.getState();
        const myId = state.localPlayerId;
        const myS = myId ? state.players[myId] : null;
        if (myS?.currentPipeNodeId === node.id) return;

        const socket = useNetworkStore.getState().socket;
        if (socket) {
          socket.emit('pipe:travel', { destinationNodeId: node.id });
        }
        return;
      }
    }
  }, [pipeNodes, nodeToCanvas]);

  if (!isUnderground || !pipeNodes || pipeNodes.length === 0 || !pipeConnections) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 25,
      pointerEvents: 'auto',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 12,
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(0, 255, 136, 0.15)',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </div>
  );
}
