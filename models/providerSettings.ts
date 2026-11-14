export interface ProviderExecutionSettings {
  timeoutMs: number;
  maxOutputTokens: number;
  maxInputBytes: number;
  maxAttempts: number;
}

export type RuntimeProvider = "openai" | "xai" | "anthropic" | "gemini" | "qwen" | "qwen-code" | "local";

const LIMITS = {
  timeoutMs: { fallback: 45_000, min: 1_000, max: 180_000 },
  maxOutputTokens: { fallback: 2_048, min: 1, max: 32_768 },
  maxInputBytes: { fallback: 128 * 1024, min: 1_024, max: 2 * 1024 * 1024 },
  maxAttempts: { fallback: 2, min: 1, max: 3 }
} as const;

function readBoundedInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(key + " must be an integer.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(key + " must be between " + minimum + " and " + maximum + ".");
  }
  return value;
}

/**
 * Resolve explicit per-provider resource limits. More specific profiles (such
 * as qwen-code) may override their family defaults. Invalid values fail closed
 * at runtime construction instead of being silently ignored.
 */
export function resolveProviderExecutionSettings(
  env: NodeJS.ProcessEnv,
  provider: RuntimeProvider
): ProviderExecutionSettings {
  const family = provider === "qwen-code" ? "QWEN_CODE" : provider.toUpperCase().replace(/-/g, "_");
  const fallbackFamily = provider === "qwen-code" ? "QWEN" : undefined;
  const result = {} as ProviderExecutionSettings;
  for (const key of Object.keys(LIMITS) as Array<keyof ProviderExecutionSettings>) {
    const limits = LIMITS[key];
    const specific = "AIFIAR_" + family + "_" + key.replace(/[A-Z]/g, (letter) => "_" + letter).toUpperCase();
    const fallback = fallbackFamily
      ? "AIFIAR_" + fallbackFamily + "_" + key.replace(/[A-Z]/g, (letter) => "_" + letter).toUpperCase()
      : undefined;
    const global = "AIFIAR_DEFAULT_" + key.replace(/[A-Z]/g, (letter) => "_" + letter).toUpperCase();
    const selectedKey = env[specific]?.trim() ? specific
      : fallback && env[fallback]?.trim() ? fallback
      : env[global]?.trim() ? global : undefined;
    result[key] = readBoundedInteger(env, selectedKey ?? specific, limits.fallback, limits.min, limits.max);
  }
  return result;
}
