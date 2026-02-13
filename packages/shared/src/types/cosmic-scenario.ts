import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// Cosmic Scenario — AI-generated celestial body configs + era timeline
// Generated once per game via Gemini API, sent to all clients
// ═══════════════════════════════════════════════════════════════

export const CelestialBodyConfigSchema = z.object({
  name: z.string().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  radius: z.number().min(20).max(50),
  intensity: z.number().min(0.2).max(0.5),
  pulseSpeed: z.number().min(0.5).max(2.0),
  // Extended visual parameters (optional — AI-generated)
  coronaColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  dustCloudColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  coronaIntensity: z.number().min(0.5).max(3.0).optional(),
  dustCloudRadius: z.number().min(30).max(120).optional(),
});

export const CosmicPhaseSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(1),
  era: z.enum(['stable', 'chaosInferno', 'chaosIce']),
  gravity: z.number().min(0.2).max(2.5),
  description: z.string().min(1).max(200),
});

export const StarfieldConfigSchema = z.object({
  starCount: z.number().min(2000).max(8000),
  starSaturation: z.number().min(0).max(1),
  nebulaColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  nebulaIntensity: z.number().min(0.1).max(1.0),
  cosmicDustDensity: z.number().min(0.1).max(1.0),
  cosmicDustColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const CosmicScenarioSchema = z.object({
  theme: z.string().min(1).max(100),
  suns: z.tuple([CelestialBodyConfigSchema, CelestialBodyConfigSchema, CelestialBodyConfigSchema]),
  phases: z.array(CosmicPhaseSchema).min(4).max(12),
  starfield: StarfieldConfigSchema.optional(),
});

export type CelestialBodyConfig = z.infer<typeof CelestialBodyConfigSchema>;
export type CosmicPhase = z.infer<typeof CosmicPhaseSchema>;
export type StarfieldConfig = z.infer<typeof StarfieldConfigSchema>;
export type CosmicScenario = z.infer<typeof CosmicScenarioSchema>;
