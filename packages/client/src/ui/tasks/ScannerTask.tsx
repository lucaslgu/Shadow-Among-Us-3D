import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function ScannerTask({ onComplete, onCancel }: TaskComponentProps) {
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressRef = useRef(0);

  const SCAN_DURATION = 3000; // 3 seconds

  const stopScanning = useCallback(() => {
    setScanning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Reset progress when released before completion
    if (!completed) {
      setProgress(0);
      progressRef.current = 0;
    }
  }, [completed]);

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp - progressRef.current * SCAN_DURATION;
    }

    const elapsed = timestamp - startTimeRef.current;
    const newProgress = Math.min(elapsed / SCAN_DURATION, 1);
    progressRef.current = newProgress;
    setProgress(newProgress);

    if (newProgress >= 1) {
      setCompleted(true);
      setScanning(false);
      // Brief delay before calling onComplete for visual feedback
      setTimeout(onComplete, 400);
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [onComplete]);

  const startScanning = useCallback(() => {
    if (completed) return;
    setScanning(true);
    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
  }, [animate, completed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const pct = Math.round(progress * 100);
  const barColor = completed ? '#4ade80' : scanning ? '#44aaff' : '#2a2a45';

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Bio-Identification Scanner
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 32 }}>
        Hold the button to scan
      </div>

      {/* Scanner visual area */}
      <div
        style={{
          width: '100%',
          height: 120,
          background: '#0a0a12',
          border: '1px solid #2a2a45',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scan line animation */}
        {scanning && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: `${(1 - progress) * 100}%`,
              width: '100%',
              height: 2,
              background: '#44aaff',
              boxShadow: '0 0 12px #44aaff',
              transition: 'top 0.05s linear',
            }}
          />
        )}

        {/* Fingerprint icon area */}
        <div
          style={{
            fontSize: 48,
            color: completed ? '#4ade80' : scanning ? '#44aaff' : '#2a2a45',
            fontFamily: "'Courier New', monospace",
            fontWeight: 700,
            transition: 'color 0.3s',
          }}
        >
          {completed ? 'OK' : '///'}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          height: 24,
          background: '#0a0a12',
          border: '1px solid #2a2a45',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 12,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 12,
            transition: scanning ? 'none' : 'width 0.2s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: '#e2e2f0',
            fontFamily: "'Courier New', monospace",
          }}
        >
          {pct}%
        </div>
      </div>

      {/* Scan button */}
      <button
        onMouseDown={startScanning}
        onMouseUp={stopScanning}
        onMouseLeave={stopScanning}
        onTouchStart={startScanning}
        onTouchEnd={stopScanning}
        disabled={completed}
        style={{
          width: '100%',
          padding: '16px 32px',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          border: `2px solid ${completed ? '#4ade80' : scanning ? '#44aaff' : '#2a2a45'}`,
          borderRadius: 12,
          background: completed
            ? 'rgba(74, 222, 128, 0.15)'
            : scanning
              ? 'rgba(68, 170, 255, 0.15)'
              : 'rgba(42, 42, 69, 0.3)',
          color: completed ? '#4ade80' : scanning ? '#44aaff' : '#e2e2f0',
          cursor: completed ? 'default' : 'pointer',
          transition: 'all 0.2s',
          userSelect: 'none',
        }}
      >
        {completed
          ? 'Scan Complete!'
          : scanning
            ? 'Scanning...'
            : 'Hold to Scan'}
      </button>
    </div>
  );
}
