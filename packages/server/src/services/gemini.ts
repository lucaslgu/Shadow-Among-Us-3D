import { CosmicScenarioSchema, type CosmicScenario } from '@shadow/shared';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 8000;

// ═══════════════════════════════════════════════════════════════
// Default fallback scenario (matches old 125s×2 cycle expanded to 300s)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SCENARIO: CosmicScenario = {
  theme: 'Classic Orbit',
  initialConfig: 'triangle',
  suns: [
    { name: 'Ignis', color: '#ff6600', radius: 35, intensity: 0.4, pulseSpeed: 0.8,
      coronaColor: '#ff8833', dustCloudColor: '#ff4400', coronaIntensity: 1.5, dustCloudRadius: 70, mass: 1.0 },
    { name: 'Glacius', color: '#4488ff', radius: 24, intensity: 0.3, pulseSpeed: 1.1,
      coronaColor: '#66aaff', dustCloudColor: '#3366cc', coronaIntensity: 1.2, dustCloudRadius: 50, mass: 0.8 },
    { name: 'Lumen', color: '#ffffee', radius: 30, intensity: 0.35, pulseSpeed: 0.9,
      coronaColor: '#ffffcc', dustCloudColor: '#ccccaa', coronaIntensity: 1.3, dustCloudRadius: 60, mass: 1.2 },
  ],
  phases: [
    { startSec: 0, endSec: 80, era: 'stable', gravity: 1.0, description: 'The three suns orbit in harmony.' },
    { startSec: 80, endSec: 120, era: 'chaosInferno', gravity: 2.0, description: 'The suns approach dangerously!' },
    { startSec: 120, endSec: 180, era: 'stable', gravity: 1.0, description: 'A temporary calm returns.' },
    { startSec: 180, endSec: 220, era: 'chaosGravity', gravity: 2.8, description: 'Binary formation — tidal forces rip through the station.' },
    { startSec: 220, endSec: 290, era: 'stable', gravity: 1.0, description: 'Gravitational equilibrium restored.' },
    { startSec: 290, endSec: 335, era: 'chaosIce', gravity: 0.3, description: 'All suns vanish beyond the horizon.' },
    { startSec: 335, endSec: 390, era: 'stable', gravity: 1.0, description: 'The suns slowly return.' },
    { startSec: 390, endSec: 430, era: 'chaosInferno', gravity: 1.8, description: 'Triple alignment imminent!' },
    { startSec: 430, endSec: 480, era: 'chaosIce', gravity: 0.3, description: 'Eternal night approaches.' },
  ],
  starfield: {
    starCount: 4000,
    starSaturation: 0.3,
    nebulaColor: '#1a0033',
    nebulaIntensity: 0.4,
    cosmicDustDensity: 0.5,
    cosmicDustColor: '#222244',
  },
};

// ═══════════════════════════════════════════════════════════════
// Prompt
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a cosmic scenario designer for the game "Shadow Among Us 3D", inspired by the Three-Body Problem. The game takes place on a space station orbiting a chaotic star system with 3 suns that follow real gravitational N-body dynamics.

Generate a unique cosmic scenario with:
1. A creative theme in English (e.g., "Triple Eclipse", "Dance of the Titans", "Solar Fury")
2. Configuration for 3 suns with unique names, varied hex colors, different sizes, intensities, and MASSES
3. An initial orbital configuration preset
4. A timeline of 7 to 10 environmental phases covering exactly 480 seconds
5. Background star field configuration

Phase rules:
- "stable": normal gravity (0.8-1.2), calm environment, floating dust
- "chaosInferno": high gravity (1.5-2.5), fire, extreme heat, suns nearby
- "chaosIce": low gravity (0.2-0.5), ice, snow, darkness, distant suns
- "chaosGravity": extreme gravity (2.5-3.0), gravitational anomalies — two suns form a tight binary pair creating tidal stress waves that damage the station. Purple fog, space distortion effects.
- Phases must be contiguous (endSec of one = startSec of the next)
- The first phase must start at startSec=0
- The last phase must end at endSec=480
- Alternate between eras — do not repeat the same era consecutively
- The first phase must be "stable" (60-100 seconds)
- Include at least 1 phase of each chaos type (chaosInferno, chaosIce, chaosGravity)
- chaosGravity phases should be 30-50 seconds long (intense but short)
- Descriptions in English, max 100 characters, narrative and dramatic

Sun rules:
- Varied and creative colors (hex format #RRGGBB)
- radius: 20-50 (visual size)
- intensity: 0.2-0.5 (light intensity)
- pulseSpeed: 0.5-2.0 (pulse speed)
- mass: 0.5-2.0 (gravitational mass — heavier suns dominate the orbit). Vary the masses for interesting dynamics. Unequal masses create more dramatic binary formations.
- Each sun should have a distinct personality (one can be aggressive/large/heavy, another cold/small/light, etc)
- coronaColor: hex color of the halo/corona around the sun (slightly different from the main color, lighter)
- dustCloudColor: hex color of the dust cloud/accretion disk orbiting the sun
- coronaIntensity: 0.5-3.0 (corona brightness multiplier — aggressive suns have more intense corona)
- dustCloudRadius: 30-120 (dust cloud radius around the sun — proportional to size)

Initial config rules:
- initialConfig: one of "triangle", "hierarchical", or "figure8"
  - "triangle": equilateral Lagrange configuration — unstable, long chaotic evolution (good for mixed scenarios)
  - "hierarchical": two suns start as a tight binary + one distant satellite — faster binary events (good for chaosGravity-heavy scenarios)
  - "figure8": stable figure-8 choreographic orbit — periodic and elegant (good for stable-heavy scenarios)

Star field rules:
- starCount: 2000-8000 (number of stars in the sky — more dramatic scenarios = more stars)
- starSaturation: 0-1 (0=white stars, 1=colorful — chaotic scenarios have more color)
- nebulaColor: hex color of the dominant nebula in the sky (thematically consistent: fire=reddish, ice=bluish, gravity=purple, mixed=purple)
- nebulaIntensity: 0.1-1.0 (intensity/opacity of nebula clouds)
- cosmicDustDensity: 0.1-1.0 (density of cosmic dust floating through space)
- cosmicDustColor: hex color of ambient cosmic dust`;

// ═══════════════════════════════════════════════════════════════
// Gemini API response schema (OpenAPI subset for structured output)
// ═══════════════════════════════════════════════════════════════

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    theme: { type: 'STRING' },
    initialConfig: { type: 'STRING', enum: ['triangle', 'hierarchical', 'figure8'] },
    suns: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          color: { type: 'STRING' },
          radius: { type: 'NUMBER' },
          intensity: { type: 'NUMBER' },
          pulseSpeed: { type: 'NUMBER' },
          mass: { type: 'NUMBER' },
          coronaColor: { type: 'STRING' },
          dustCloudColor: { type: 'STRING' },
          coronaIntensity: { type: 'NUMBER' },
          dustCloudRadius: { type: 'NUMBER' },
        },
        required: ['name', 'color', 'radius', 'intensity', 'pulseSpeed', 'mass',
                   'coronaColor', 'dustCloudColor', 'coronaIntensity', 'dustCloudRadius'],
      },
    },
    phases: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          startSec: { type: 'NUMBER' },
          endSec: { type: 'NUMBER' },
          era: { type: 'STRING', enum: ['stable', 'chaosInferno', 'chaosIce', 'chaosGravity'] },
          gravity: { type: 'NUMBER' },
          description: { type: 'STRING' },
        },
        required: ['startSec', 'endSec', 'era', 'gravity', 'description'],
      },
    },
    starfield: {
      type: 'OBJECT',
      properties: {
        starCount: { type: 'NUMBER' },
        starSaturation: { type: 'NUMBER' },
        nebulaColor: { type: 'STRING' },
        nebulaIntensity: { type: 'NUMBER' },
        cosmicDustDensity: { type: 'NUMBER' },
        cosmicDustColor: { type: 'STRING' },
      },
      required: ['starCount', 'starSaturation', 'nebulaColor', 'nebulaIntensity',
                 'cosmicDustDensity', 'cosmicDustColor'],
    },
  },
  required: ['theme', 'initialConfig', 'suns', 'phases', 'starfield'],
};

// ═══════════════════════════════════════════════════════════════
// Main function
// ═══════════════════════════════════════════════════════════════

export async function generateCosmicScenario(): Promise<CosmicScenario> {
  if (!GEMINI_API_KEY) {
    console.log('[Gemini] No API key configured, using default scenario');
    return DEFAULT_SCENARIO;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Generate a unique and creative cosmic scenario for this match.' }],
        }],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 1.0,
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[Gemini] API error: ${response.status} ${response.statusText}`, body.slice(0, 200));
      return DEFAULT_SCENARIO;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('[Gemini] No text in response');
      return DEFAULT_SCENARIO;
    }

    const parsed = JSON.parse(text);

    // Ensure exactly 3 suns (Gemini array might differ from tuple)
    if (Array.isArray(parsed.suns) && parsed.suns.length !== 3) {
      console.error(`[Gemini] Expected 3 suns, got ${parsed.suns.length}`);
      return DEFAULT_SCENARIO;
    }

    const validated = CosmicScenarioSchema.parse(parsed);

    // Post-validation: ensure phases are contiguous
    validatePhaseTimeline(validated.phases);

    console.log(`[Gemini] Generated scenario: "${validated.theme}" with ${validated.phases.length} phases`);
    return validated;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[Gemini] Request timed out after ${TIMEOUT_MS}ms`);
    } else {
      console.error('[Gemini] Error generating scenario:', err);
    }
    return DEFAULT_SCENARIO;
  }
}

// ═══════════════════════════════════════════════════════════════
// Validation helpers
// ═══════════════════════════════════════════════════════════════

function validatePhaseTimeline(phases: CosmicScenario['phases']): void {
  if (phases[0].startSec !== 0) {
    throw new Error('First phase must start at 0');
  }
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].startSec !== phases[i - 1].endSec) {
      throw new Error(`Phase gap at index ${i}: prev ends at ${phases[i - 1].endSec}, next starts at ${phases[i].startSec}`);
    }
  }
}
