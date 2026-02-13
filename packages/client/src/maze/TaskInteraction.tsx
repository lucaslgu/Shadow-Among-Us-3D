import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { TaskStationInfo, TaskCompletionState } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const TASK_INTERACT_RANGE = 4.0;
const TASK_INTERACT_RANGE_SQ = TASK_INTERACT_RANGE * TASK_INTERACT_RANGE;
const TASK_CANCEL_RANGE_SQ = 6.0 * 6.0;

interface NearbyTaskInfo {
  task: TaskStationInfo;
  canInteract: boolean;
  state: TaskCompletionState;
  isBusy: boolean;
}

/** Check if the local player can interact with a given task */
function canInteractWith(taskId: string): boolean {
  const store = useGameStore.getState();
  const { localRole, assignedTasks, mazeSnapshot } = store;

  // Shadow: any uncompleted task
  if (localRole === 'shadow') return true;

  // Crew: assigned task → always yes
  if (assignedTasks.includes(taskId)) return true;

  // Crew helper: all assigned tasks completed → can help with any pending task
  if (mazeSnapshot && assignedTasks.length > 0) {
    const allMyDone = assignedTasks.every((tid) => {
      const ts = mazeSnapshot.taskStates[tid];
      return ts?.completionState === 'completed';
    });
    if (allMyDone) return true;
  }

  return false;
}

export function TaskInteraction() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const taskOverlayVisible = useGameStore((s) => s.taskOverlayVisible);
  const assignedTasks = useGameStore((s) => s.assignedTasks);

  const nearestTaskRef = useRef<TaskStationInfo | null>(null);
  const prevTaskIdRef = useRef<string | null>(null);
  const interactConsumed = useRef(false);

  // Local state for the 3D floating prompt
  const [nearbyTask, setNearbyTask] = useState<NearbyTaskInfo | null>(null);

  // E key to start task, Escape to cancel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyE' && !interactConsumed.current) {
        interactConsumed.current = true;
        const overlay = useGameStore.getState().taskOverlayVisible;
        if (overlay) return;

        const task = nearestTaskRef.current;
        if (!task) return;

        // Check if player can interact (shadow any-task, crew assigned, crew helper)
        if (!canInteractWith(task.id)) return;

        const snap = useGameStore.getState().mazeSnapshot;
        const taskState = snap?.taskStates[task.id];
        if (!taskState || taskState.completionState === 'completed') return;

        const localId = useGameStore.getState().localPlayerId;
        if (taskState.activePlayerId && taskState.activePlayerId !== localId) return;

        const socket = useNetworkStore.getState().socket;
        if (socket) socket.emit('task:start', { taskId: task.id });

        useGameStore.getState().openTaskOverlay(task.id, task.taskType);
      }

      if (e.code === 'Escape') {
        const overlay = useGameStore.getState().taskOverlayVisible;
        const activeId = useGameStore.getState().activeTaskId;
        if (overlay && activeId) {
          const socket = useNetworkStore.getState().socket;
          if (socket) socket.emit('task:cancel', { taskId: activeId });
          useGameStore.getState().closeTaskOverlay();
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyE') interactConsumed.current = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Proximity check each frame (read position/snapshot imperatively to avoid re-renders)
  useFrame(() => {
    const { localPosition, mazeSnapshot } = useGameStore.getState();
    if (!mazeLayout?.tasks || !mazeSnapshot) {
      nearestTaskRef.current = null;
      if (prevTaskIdRef.current !== null) {
        prevTaskIdRef.current = null;
        setNearbyTask(null);
        useGameStore.getState().setNearestInteractTask(null);
      }
      return;
    }

    if (taskOverlayVisible) {
      if (prevTaskIdRef.current !== null) {
        prevTaskIdRef.current = null;
        setNearbyTask(null);
        useGameStore.getState().setNearestInteractTask(null);
      }
      return;
    }

    const [px, , pz] = localPosition;
    let best: TaskStationInfo | null = null;
    let bestDistSq = TASK_INTERACT_RANGE_SQ;

    // Detect ALL nearby tasks (not just assigned)
    for (const task of mazeLayout.tasks) {
      const dx = task.position[0] - px;
      const dz = task.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = task;
      }
    }

    nearestTaskRef.current = best;

    const newId = best?.id ?? null;
    if (newId !== prevTaskIdRef.current) {
      prevTaskIdRef.current = newId;

      if (!best) {
        setNearbyTask(null);
        useGameStore.getState().setNearestInteractTask(null);
      } else {
        const ts = mazeSnapshot.taskStates[best.id];
        const state: TaskCompletionState = ts?.completionState ?? 'pending';
        const localId = useGameStore.getState().localPlayerId;
        const isBusy = !!(ts?.activePlayerId && ts.activePlayerId !== localId);
        const interact = canInteractWith(best.id);

        setNearbyTask({ task: best, canInteract: interact, state, isBusy });

        if (interact) {
          useGameStore.getState().setNearestInteractTask({
            displayName: best.displayName,
            taskType: best.taskType,
            state,
            isBusy,
            distanceSq: bestDistSq,
          });
        } else {
          useGameStore.getState().setNearestInteractTask(null);
        }
      }
    } else if (best) {
      // Same task - check if state changed
      const ts = mazeSnapshot.taskStates[best.id];
      const state: TaskCompletionState = ts?.completionState ?? 'pending';
      const localId = useGameStore.getState().localPlayerId;
      const isBusy = !!(ts?.activePlayerId && ts.activePlayerId !== localId);
      const interact = canInteractWith(best.id);
      const prev = nearbyTask;

      if (!prev || prev.state !== state || prev.isBusy !== isBusy || prev.canInteract !== interact) {
        setNearbyTask({ task: best, canInteract: interact, state, isBusy });

        if (interact) {
          useGameStore.getState().setNearestInteractTask({
            displayName: best.displayName,
            taskType: best.taskType,
            state,
            isBusy,
            distanceSq: bestDistSq,
          });
        }
      }
    }
  });

  // Auto-cancel if player walks too far during task
  useFrame(() => {
    if (!taskOverlayVisible) return;
    const activeId = useGameStore.getState().activeTaskId;
    if (!activeId || !mazeLayout?.tasks) return;
    const task = mazeLayout.tasks.find((t) => t.id === activeId);
    if (!task) return;
    const [px, , pz] = useGameStore.getState().localPosition;
    const dx = task.position[0] - px;
    const dz = task.position[2] - pz;
    if (dx * dx + dz * dz > TASK_CANCEL_RANGE_SQ) {
      const socket = useNetworkStore.getState().socket;
      if (socket) socket.emit('task:cancel', { taskId: activeId });
      useGameStore.getState().closeTaskOverlay();
    }
  });

  // ── 3D floating prompt (like DoorInteraction) ──
  if (!nearbyTask) return null;

  const { task, canInteract: interact, state, isBusy } = nearbyTask;
  const isCompleted = state === 'completed';

  const borderColor = isCompleted
    ? '#4ade80'
    : isBusy
    ? '#fbbf24'
    : interact
    ? '#44aaff'
    : '#6b6b8a';

  return (
    <group position={[task.position[0], 2.8, task.position[2]]}>
      <Html center distanceFactor={8} zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: `2px solid ${borderColor}`,
            borderRadius: 10,
            padding: '8px 16px',
            color: '#ffffff',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: 14,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            textShadow: '0 0 6px rgba(0,0,0,0.8)',
            userSelect: 'none',
          }}
        >
          {/* Task name */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: borderColor }}>
            {task.displayName}
          </div>

          {/* Status / action */}
          {isCompleted ? (
            <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>
              Completed &#x2714;
            </div>
          ) : isBusy ? (
            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>
              In use by another player
            </div>
          ) : interact ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  background: '#44aaff',
                  color: '#000',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                E
              </span>
              <span style={{ fontSize: 13, color: '#aabbdd', fontWeight: 600 }}>
                Interact
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#6b6b8a' }}>
              Not assigned
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
