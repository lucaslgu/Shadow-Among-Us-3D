import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MazeCell, DoorInfo, MazeLayout, MazeSnapshot } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ═══════════════════════════════════════════════════════════════
// BFS Pathfinding on maze grid
// ═══════════════════════════════════════════════════════════════

function worldToCell(x: number, z: number, gridSize: number, cellSize: number): [number, number] {
  const halfMap = (gridSize * cellSize) / 2;
  const col = Math.floor((x + halfMap) / cellSize);
  const row = Math.floor((z + halfMap) / cellSize);
  return [
    Math.max(0, Math.min(gridSize - 1, row)),
    Math.max(0, Math.min(gridSize - 1, col)),
  ];
}

function cellCenterToWorld(row: number, col: number, gridSize: number, cellSize: number): [number, number] {
  const halfMap = (gridSize * cellSize) / 2;
  const x = col * cellSize - halfMap + cellSize / 2;
  const z = row * cellSize - halfMap + cellSize / 2;
  return [x, z];
}

/** Build a set of wall-sides that have doors (passable even if wall exists) */
function buildDoorWallSet(doors: DoorInfo[]): Set<string> {
  const set = new Set<string>();
  for (const door of doors) {
    set.add(`${door.row}_${door.col}_${door.side}`);
    // Also add the mirror from the other cell's perspective
    switch (door.side) {
      case 'N': if (door.row > 0) set.add(`${door.row - 1}_${door.col}_S`); break;
      case 'S': set.add(`${door.row + 1}_${door.col}_N`); break;
      case 'E': set.add(`${door.row}_${door.col + 1}_W`); break;
      case 'W': if (door.col > 0) set.add(`${door.row}_${door.col - 1}_E`); break;
    }
  }
  return set;
}

function canPass(
  r1: number, c1: number, r2: number, c2: number,
  cells: MazeCell[], gridSize: number,
  doorWallSet: Set<string>,
): boolean {
  const dr = r2 - r1;
  const dc = c2 - c1;
  const idx1 = r1 * gridSize + c1;
  const cell = cells[idx1];
  if (!cell) return false;

  let hasWall: boolean;
  let wallKey: string;

  if (dr === -1 && dc === 0) {
    hasWall = cell.wallNorth;
    wallKey = `${r1}_${c1}_N`;
  } else if (dr === 1 && dc === 0) {
    hasWall = cell.wallSouth;
    wallKey = `${r1}_${c1}_S`;
  } else if (dr === 0 && dc === 1) {
    hasWall = cell.wallEast;
    wallKey = `${r1}_${c1}_E`;
  } else if (dr === 0 && dc === -1) {
    hasWall = cell.wallWest;
    wallKey = `${r1}_${c1}_W`;
  } else {
    return false;
  }

  if (!hasWall) return true;
  // Wall exists — passable if there's a door on this wall (player can open it)
  return doorWallSet.has(wallKey);
}

/** BFS from player cell, returns path to nearest target cell from `targets` */
function bfsToNearest(
  startR: number, startC: number,
  targets: Set<string>,
  cells: MazeCell[], gridSize: number,
  doorWallSet: Set<string>,
): [number, number][] | null {
  const startKey = `${startR}_${startC}`;
  if (targets.has(startKey)) return [[startR, startC]];

  const queue: [number, number][] = [[startR, startC]];
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  visited.add(startKey);
  parent.set(startKey, null);

  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;

    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
      const nk = `${nr}_${nc}`;
      if (visited.has(nk)) continue;
      if (!canPass(r, c, nr, nc, cells, gridSize, doorWallSet)) continue;

      visited.add(nk);
      parent.set(nk, `${r}_${c}`);

      if (targets.has(nk)) {
        // Reconstruct path
        const path: [number, number][] = [];
        let curr: string | null = nk;
        while (curr !== null) {
          const parts = curr.split('_').map(Number);
          path.unshift([parts[0], parts[1]]);
          curr = parent.get(curr) ?? null;
        }
        return path;
      }

      queue.push([nr, nc]);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// TaskGuide — 3D floor line showing path to nearest task
// ═══════════════════════════════════════════════════════════════

const PATH_Y = 0.06; // slightly above floor
const UPDATE_INTERVAL = 0.4; // seconds between path recalculation
const MAX_PATH_POINTS = 200;

export function TaskGuide() {
  const lineObjRef = useRef<THREE.Line | null>(null);
  const timerRef = useRef(0);
  const pointCountRef = useRef(0);

  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const mazeSnapshot = useGameStore((s) => s.mazeSnapshot);
  const assignedTasks = useGameStore((s) => s.assignedTasks);
  const isGhost = useGameStore((s) => s.isGhost);

  // Precompute door wall set (stable per maze layout)
  const doorWallSet = useMemo(() => {
    if (!mazeLayout?.doors) return new Set<string>();
    return buildDoorWallSet(mazeLayout.doors);
  }, [mazeLayout]);

  // Geometry + material (created once)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PATH_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const material = useMemo(() => {
    return new THREE.LineDashedMaterial({
      color: '#44aaff',
      dashSize: 0.8,
      gapSize: 0.4,
      linewidth: 1,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
  }, []);

  useFrame((_, delta) => {
    if (!mazeLayout || !mazeSnapshot || isGhost) {
      geometry.setDrawRange(0, 0);
      return;
    }

    timerRef.current += delta;
    if (timerRef.current < UPDATE_INTERVAL) {
      // Still update line dash offset for animation
      (material as any).dashOffset -= delta * 2;
      if (lineObjRef.current) lineObjRef.current.computeLineDistances();
      return;
    }
    timerRef.current = 0;

    const store = useGameStore.getState();
    const { localPosition, localRole, selectedGuideTaskId } = store;
    const [px, , pz] = localPosition;
    const { gridSize, cellSize, cells, tasks } = mazeLayout;

    // Build target list depending on role and state
    const targetCells = new Set<string>();
    const cellToTask = new Map<string, typeof tasks[0]>();

    const isShadow = localRole === 'shadow';
    const allMyDone = assignedTasks.length > 0 && assignedTasks.every((tid) => {
      const ts = mazeSnapshot.taskStates[tid];
      return ts?.completionState === 'completed';
    });

    if (isShadow && selectedGuideTaskId) {
      // Shadow: route to a specific manually-selected task
      const ts = mazeSnapshot.taskStates[selectedGuideTaskId];
      if (ts?.completionState !== 'completed') {
        const task = tasks.find((t) => t.id === selectedGuideTaskId);
        if (task) {
          const [tr, tc] = worldToCell(task.position[0], task.position[2], gridSize, cellSize);
          const key = `${tr}_${tc}`;
          targetCells.add(key);
          cellToTask.set(key, task);
        }
      }
    } else if (isShadow) {
      // Shadow without selection: route to nearest uncompleted assigned task (fake tasks)
      for (const taskId of assignedTasks) {
        const ts = mazeSnapshot.taskStates[taskId];
        if (ts?.completionState === 'completed') continue;
        const task = tasks.find((t) => t.id === taskId);
        if (!task) continue;
        const [tr, tc] = worldToCell(task.position[0], task.position[2], gridSize, cellSize);
        const key = `${tr}_${tc}`;
        targetCells.add(key);
        cellToTask.set(key, task);
      }
    } else if (allMyDone) {
      // Crew helper: route to any global uncompleted task
      for (const task of tasks) {
        const ts = mazeSnapshot.taskStates[task.id];
        if (ts?.completionState === 'completed') continue;
        const [tr, tc] = worldToCell(task.position[0], task.position[2], gridSize, cellSize);
        const key = `${tr}_${tc}`;
        targetCells.add(key);
        cellToTask.set(key, task);
      }
    } else {
      // Crew: route to uncompleted assigned tasks
      for (const taskId of assignedTasks) {
        const ts = mazeSnapshot.taskStates[taskId];
        if (ts?.completionState === 'completed') continue;
        const task = tasks.find((t) => t.id === taskId);
        if (!task) continue;
        const [tr, tc] = worldToCell(task.position[0], task.position[2], gridSize, cellSize);
        const key = `${tr}_${tc}`;
        targetCells.add(key);
        cellToTask.set(key, task);
      }
    }

    if (targetCells.size === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    // BFS from player to nearest target
    const [startR, startC] = worldToCell(px, pz, gridSize, cellSize);
    const cellPath = bfsToNearest(startR, startC, targetCells, cells, gridSize, doorWallSet);

    if (!cellPath || cellPath.length < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    // Convert cell path to world coordinates
    // First point: actual player position
    // Middle points: cell centers
    // Last point: actual task position
    const lastCellKey = `${cellPath[cellPath.length - 1][0]}_${cellPath[cellPath.length - 1][1]}`;
    const targetTask = cellToTask.get(lastCellKey);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    let idx = 0;

    // Player position
    arr[idx++] = px;
    arr[idx++] = PATH_Y;
    arr[idx++] = pz;

    // Cell centers (skip first since we use player pos, and skip last since we use task pos)
    for (let i = 1; i < cellPath.length - 1 && idx < (MAX_PATH_POINTS - 1) * 3; i++) {
      const [wr, wc] = cellPath[i];
      const [wx, wz] = cellCenterToWorld(wr, wc, gridSize, cellSize);
      arr[idx++] = wx;
      arr[idx++] = PATH_Y;
      arr[idx++] = wz;
    }

    // Target task position
    if (targetTask && idx < MAX_PATH_POINTS * 3) {
      arr[idx++] = targetTask.position[0];
      arr[idx++] = PATH_Y;
      arr[idx++] = targetTask.position[2];
    } else {
      // Fallback: last cell center
      const [lr, lc] = cellPath[cellPath.length - 1];
      const [lx, lz] = cellCenterToWorld(lr, lc, gridSize, cellSize);
      arr[idx++] = lx;
      arr[idx++] = PATH_Y;
      arr[idx++] = lz;
    }

    const pointCount = idx / 3;
    pointCountRef.current = pointCount;
    positions.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    // Recompute line distances for dashes
    if (lineObjRef.current) lineObjRef.current.computeLineDistances();

    // Animate dash offset
    (material as any).dashOffset -= delta * 2;
  });

  // Create the THREE.Line object once, reuse across renders
  const lineObject = useMemo(() => {
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.computeLineDistances();
    return line;
  }, [geometry, material]);

  // Store ref for useFrame access
  lineObjRef.current = lineObject;

  if (!mazeLayout) return null;

  return <primitive object={lineObject} />;
}
