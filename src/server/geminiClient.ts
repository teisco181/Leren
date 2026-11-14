import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

export const MODEL_NAME = "gemini-4-hydrogen";

interface KeySlot {
  index: number;
  client: GoogleGenAI;
  cooldownUntil: number;
}

let cachedSignature = "";
let cachedSlots: KeySlot[] = [];

function loadConfiguredKeys(): string[] {
  const rawList: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    rawList.push(process.env.GEMINI_API_KEY);
  }
  if (process.env.GEMINI_API_KEY_2) {
    rawList.push(process.env.GEMINI_API_KEY_2);
  }
  if (process.env.GEMINI_API_KEY_3) {
    rawList.push(process.env.GEMINI_API_KEY_3);
  }
  if (process.env.GEMINI_API_KEYS) {
    for (const part of process.env.GEMINI_API_KEYS.split(",")) {
      rawList.push(part);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed || trimmed === "MY_GEMINI_API_KEY" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

function getKeySlots(): KeySlot[] {
  const keys = loadConfiguredKeys();
  const signature = keys.join("|");
  if (signature !== cachedSignature) {
    cachedSignature = signature;
    cachedSlots = keys.map((apiKey, index) => ({
      index,
      client: new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }),
      cooldownUntil: 0,
    }));
  }
  return cachedSlots;
}

export function getConfiguredKeyCount(): number {
  return getKeySlots().length;
}

export function isRateLimitOrQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = (err as { status?: number; code?: number } | null)?.status ??
    (err as { code?: number } | null)?.code;
  if (status === 429) return true;
  const upper = message.toUpperCase();
  return (
    upper.includes("RESOURCE_EXHAUSTED") ||
    upper.includes("429") ||
    upper.includes("QUOTA") ||
    upper.includes("RATE LIMIT") ||
    upper.includes("RATE_LIMIT")
  );
}

/**
 * Runs a Gemini SDK operation across configured server-side API keys.
 * Starts with non-cooled keys in priority order (GEMINI_API_KEY, GEMINI_API_KEY_2, ...).
 * Automatically fails over to the next key whenever a 429 / RESOURCE_EXHAUSTED error occurs.
 */
export async function executeWithGeminiFailover<T>(
  operation: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  const slots = getKeySlots();
  if (slots.length === 0) {
    throw new Error("API_KEY_INVALID: Er is geen GEMINI_API_KEY geconfigureerd op de server.");
  }

  const now = Date.now();
  const available = slots.filter((s) => s.cooldownUntil <= now);
  const cooling = slots
    .filter((s) => s.cooldownUntil > now)
    .sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  const orderedSlots = [...available, ...cooling];

  let lastError: unknown;

  for (let i = 0; i < orderedSlots.length; i++) {
    const slot = orderedSlots[i];
    try {
      const result = await operation(slot.client);
      // Clear cooldown if this key succeeded
      slot.cooldownUntil = 0;
      return result;
    } catch (err) {
      lastError = err;
      if (isRateLimitOrQuotaError(err)) {
        // Put exhausted key into cooldown (5 min) and immediately fail over to the next key
        slot.cooldownUntil = Date.now() + 5 * 60 * 1000;
        if (i < orderedSlots.length - 1) {
          console.warn(
            `Gemini API-sleutel #${slot.index + 1} bereikte limiet; schakel automatisch over naar sleutel #${orderedSlots[i + 1].index + 1}.`
          );
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError;
}

export async function generateContentWithFailover(
  params: GenerateContentParameters
): Promise<GenerateContentResponse> {
  return executeWithGeminiFailover((ai) => ai.models.generateContent(params));
}
