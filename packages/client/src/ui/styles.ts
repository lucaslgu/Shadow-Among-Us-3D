import type { CSSProperties } from 'react';

export const colors = {
  bg: '#0a0a12',
  surface: '#12121f',
  surfaceHover: '#1a1a30',
  border: '#2a2a45',
  borderFocus: '#6d28d9',
  primary: '#6d28d9',
  primaryHover: '#7c3aed',
  text: '#e2e2f0',
  textMuted: '#6b6b8a',
  danger: '#ef4444',
  success: '#4ade80',
  warning: '#fbbf24',
};

export const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  overflowY: 'auto',
  padding: '40px 0',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  color: colors.text,
  zIndex: 10,
};

export const card: CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 32,
  width: 420,
  maxWidth: '90vw',
};

export const cardWide: CSSProperties = {
  ...card,
  width: 560,
};

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 4,
  letterSpacing: '-0.5px',
};

export const subtitle: CSSProperties = {
  fontSize: 14,
  color: colors.textMuted,
  marginBottom: 24,
};

export const input: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

export const button: CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  background: colors.primary,
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

export const buttonOutline: CSSProperties = {
  ...button,
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  color: colors.text,
};

export const errorText: CSSProperties = {
  color: colors.danger,
  fontSize: 13,
  marginTop: 8,
  textAlign: 'center',
};

export const label: CSSProperties = {
  fontSize: 13,
  color: colors.textMuted,
  marginBottom: 6,
  display: 'block',
};

export const backButton: CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.textMuted,
  fontSize: 13,
  cursor: 'pointer',
  padding: '4px 0',
  marginBottom: 16,
};
