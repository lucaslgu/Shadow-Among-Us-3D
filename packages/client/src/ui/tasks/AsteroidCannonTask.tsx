import { useState, useRef, useEffect, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

const TOTAL_ASTEROIDS = 5;
const VIEWPORT_W = 520;
const VIEWPORT_H = 320;

function randomEdgeSpawn(): { x: number; y: number; vx: number; vy: number } {
  const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
  const speed = 0.4 + Math.random() * 0.8; // pixels per frame (~60fps)

  switch (edge) {
    case 0: // top
      return { x: Math.random() * VIEWPORT_W, y: -20, vx: (Math.random() - 0.5) * speed, vy: speed };
    case 1: // right
      return { x: VIEWPORT_W + 20, y: Math.random() * VIEWPORT_H, vx: -speed, vy: (Math.random() - 0.5) * speed };
    case 2: // bottom
      return { x: Math.random() * VIEWPORT_W, y: VIEWPORT_H + 20, vx: (Math.random() - 0.5) * speed, vy: -speed };
    default: // left
      return { x: -20, y: Math.random() * VIEWPORT_H, vx: speed, vy: (Math.random() - 0.5) * speed };
  }
}

function createAsteroid(id: number): Asteroid {
  const spawn = randomEdgeSpawn();
  return {
    id,
    ...spawn,
    size: 32 + Math.random() * 16,
  };
}

export function AsteroidCannonTask({ onComplete, onCancel }: TaskComponentProps) {
  const [destroyed, setDestroyed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [asteroids, setAsteroids] = useState<Asteroid[]>(() =>
    Array.from({ length: TOTAL_ASTEROIDS }, (_, i) => createAsteroid(i)),
  );
  const rafRef = useRef<number | null>(null);
  const nextIdRef = useRef(TOTAL_ASTEROIDS);

  const destroyAsteroid = useCallback(
    (id: number) => {
      if (completed) return;

      setAsteroids((prev) => prev.filter((a) => a.id !== id));
      setDestroyed((prev) => {
        const next = prev + 1;
        if (next >= TOTAL_ASTEROIDS) {
          setCompleted(true);
          setTimeout(onComplete, 500);
        }
        return next;
      });
    },
    [completed, onComplete],
  );

  // Animation loop
  useEffect(() => {
    const animate = () => {
      setAsteroids((prev) =>
        prev.map((a) => {
          let { x, y, vx, vy } = a;
          x += vx;
          y += vy;

          // Respawn if way off screen
          if (x < -60 || x > VIEWPORT_W + 60 || y < -60 || y > VIEWPORT_H + 60) {
            const spawn = randomEdgeSpawn();
            return { ...a, x: spawn.x, y: spawn.y, vx: spawn.vx, vy: spawn.vy };
          }

          return { ...a, x, y };
        }),
      );

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Asteroid Cannon
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 20 }}>
        Destroy the asteroids! ({destroyed}/{TOTAL_ASTEROIDS})
      </div>

      {/* Score bar */}
      <div
        style={{
          width: '100%',
          height: 8,
          background: '#0a0a12',
          border: '1px solid #2a2a45',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: `${(destroyed / TOTAL_ASTEROIDS) * 100}%`,
            height: '100%',
            background: completed ? '#4ade80' : '#44aaff',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Viewport */}
      <div
        style={{
          width: VIEWPORT_W,
          height: VIEWPORT_H,
          background: '#060610',
          border: '1px solid #2a2a45',
          borderRadius: 12,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'crosshair',
          margin: '0 auto',
        }}
      >
        {/* Star field background */}
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={`star-${i}`}
            style={{
              position: 'absolute',
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              width: 2,
              height: 2,
              borderRadius: '50%',
              background: `rgba(255, 255, 255, ${0.1 + (i % 5) * 0.08})`,
            }}
          />
        ))}

        {/* Crosshair in center */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 24,
            border: '1px solid rgba(68, 170, 255, 0.3)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 4,
              height: 4,
              background: 'rgba(68, 170, 255, 0.5)',
              borderRadius: '50%',
            }}
          />
        </div>

        {/* Asteroids */}
        {asteroids.map((asteroid) => (
          <div
            key={asteroid.id}
            onClick={() => destroyAsteroid(asteroid.id)}
            style={{
              position: 'absolute',
              left: asteroid.x - asteroid.size / 2,
              top: asteroid.y - asteroid.size / 2,
              width: asteroid.size,
              height: asteroid.size,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #5a5a6a, #2a2a35, #1a1a22)',
              border: '2px solid #4a4a5a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 8px rgba(0,0,0,0.5)',
              transition: 'none',
            }}
          />
        ))}

        {/* Completion overlay */}
        {completed && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(74, 222, 128, 0.1)',
              fontSize: 20,
              fontWeight: 700,
              color: '#4ade80',
            }}
          >
            All destroyed!
          </div>
        )}
      </div>
    </div>
  );
}
