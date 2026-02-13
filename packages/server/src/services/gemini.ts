import { CosmicScenarioSchema, type CosmicScenario } from '@shadow/shared';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 8000;

// ═══════════════════════════════════════════════════════════════
// Default fallback scenario (matches old 125s×2 cycle expanded to 300s)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SCENARIO: CosmicScenario = {
  theme: 'Orbita Classica',
  suns: [
    { name: 'Ignis', color: '#ff6600', radius: 35, intensity: 0.4, pulseSpeed: 0.8,
      coronaColor: '#ff8833', dustCloudColor: '#ff4400', coronaIntensity: 1.5, dustCloudRadius: 70 },
    { name: 'Glacius', color: '#4488ff', radius: 24, intensity: 0.3, pulseSpeed: 1.1,
      coronaColor: '#66aaff', dustCloudColor: '#3366cc', coronaIntensity: 1.2, dustCloudRadius: 50 },
    { name: 'Lumen', color: '#ffffee', radius: 30, intensity: 0.35, pulseSpeed: 0.9,
      coronaColor: '#ffffcc', dustCloudColor: '#ccccaa', coronaIntensity: 1.3, dustCloudRadius: 60 },
  ],
  phases: [
    { startSec: 0, endSec: 90, era: 'stable', gravity: 1.0, description: 'Os tres sois orbitam em harmonia.' },
    { startSec: 90, endSec: 130, era: 'chaosInferno', gravity: 2.0, description: 'Os sois se aproximam perigosamente!' },
    { startSec: 130, endSec: 190, era: 'stable', gravity: 1.0, description: 'Uma calma temporaria retorna.' },
    { startSec: 190, endSec: 230, era: 'chaosIce', gravity: 0.3, description: 'Todos os sois desaparecem no horizonte.' },
    { startSec: 230, endSec: 320, era: 'stable', gravity: 1.0, description: 'Os sois retornam lentamente.' },
    { startSec: 320, endSec: 365, era: 'chaosInferno', gravity: 1.8, description: 'Alinhamento triplo iminente!' },
    { startSec: 365, endSec: 420, era: 'stable', gravity: 1.0, description: 'Estabilidade restaurada.' },
    { startSec: 420, endSec: 480, era: 'chaosIce', gravity: 0.3, description: 'Noite eterna se aproxima.' },
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

const SYSTEM_PROMPT = `Voce e um designer de cenarios cosmicos para o jogo "Shadow Among Us 3D", inspirado no Problema dos Tres Corpos. O jogo se passa em uma estacao espacial orbitando um sistema estelar caotico com 3 sois.

Gere um cenario cosmico unico com:
1. Um tema criativo em portugues (ex: "Eclipse Tripla", "Danca dos Titas", "Furia Solar")
2. Configuracao de 3 sois com nomes unicos, cores hex variadas, tamanhos e intensidades diferentes
3. Uma timeline de 6 a 10 fases ambientais cobrindo exatamente 480 segundos
4. Configuracao do campo estelar de fundo

Regras das fases:
- "stable": gravidade normal (0.8-1.2), ambiente calmo, poeira flutuante
- "chaosInferno": gravidade alta (1.5-2.5), fogo, calor extremo, sois proximos
- "chaosIce": gravidade baixa (0.2-0.5), gelo, neve, escuridao, sois distantes
- As fases devem ser contiguas (endSec de uma = startSec da proxima)
- A primeira fase deve comecar em startSec=0
- A ultima fase deve terminar em endSec=480
- Alterne entre eras — nao repita a mesma era consecutivamente
- A primeira fase deve ser "stable" (60-100 segundos)
- Inclua pelo menos 2 fases de cada tipo de caos
- Descricoes em portugues, max 100 caracteres, narrativas e dramaticas

Regras dos sois:
- Cores variadas e criativas (hex format #RRGGBB)
- radius: 20-50 (tamanho visual)
- intensity: 0.2-0.5 (intensidade luminosa)
- pulseSpeed: 0.5-2.0 (velocidade de pulsacao)
- Cada sol deve ter personalidade distinta (um pode ser agressivo/grande, outro frio/pequeno, etc)
- coronaColor: cor hex do halo/corona ao redor do sol (ligeiramente diferente da cor principal, mais clara)
- dustCloudColor: cor hex da nuvem de poeira/disco de acrecao que orbita o sol
- coronaIntensity: 0.5-3.0 (multiplicador de brilho da corona — sois agressivos tem corona mais intensa)
- dustCloudRadius: 30-120 (raio da nuvem de poeira ao redor do sol — proporcional ao tamanho)

Regras do campo estelar:
- starCount: 2000-8000 (quantidade de estrelas no ceu — cenarios mais dramaticos = mais estrelas)
- starSaturation: 0-1 (0=estrelas brancas, 1=coloridas — cenarios caoticos tem mais cor)
- nebulaColor: cor hex da nebulosa dominante no ceu (tematicamente consistente: fogo=avermelhada, gelo=azulada, misto=roxa)
- nebulaIntensity: 0.1-1.0 (intensidade/opacidade das nuvens de nebulosa)
- cosmicDustDensity: 0.1-1.0 (densidade de poeira cosmica flutuando pelo espaco)
- cosmicDustColor: cor hex da poeira cosmica ambiental`;

// ═══════════════════════════════════════════════════════════════
// Gemini API response schema (OpenAPI subset for structured output)
// ═══════════════════════════════════════════════════════════════

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    theme: { type: 'STRING' },
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
          coronaColor: { type: 'STRING' },
          dustCloudColor: { type: 'STRING' },
          coronaIntensity: { type: 'NUMBER' },
          dustCloudRadius: { type: 'NUMBER' },
        },
        required: ['name', 'color', 'radius', 'intensity', 'pulseSpeed',
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
          era: { type: 'STRING', enum: ['stable', 'chaosInferno', 'chaosIce'] },
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
  required: ['theme', 'suns', 'phases', 'starfield'],
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
          parts: [{ text: 'Gere um cenario cosmico unico e criativo para esta partida.' }],
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
