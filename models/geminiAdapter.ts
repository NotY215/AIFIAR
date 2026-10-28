import type { TaskExecutor } from "../core/orchestrator.js";
import { buildModelExecutionInstructions } from "../core/modelExecutionInstructions.js";
import { redactPotentialSecrets } from "../core/secretRedaction.js";
import type { Task, TaskResult } from "../core/types.js";
import type { ProviderTelemetryEvent } from "./providerTelemetry.js";
import type { ModelDiscoveryResult } from "./providerDiscovery.js";

export interface GeminiAdapterConfig {
  apiKey: string;
  modelId: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxInputBytes?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: ProviderTelemetryEvent) => void;
}

class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIGURATION" | "INVALID_RESPONSE" | "AUTHENTICATION" | "RATE_LIMITED" | "REMOTE_ERROR" | "TIMEOUT" | "NETWORK_ERROR" | "SAFETY_BLOCK",
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

function validateConfig(config: GeminiAdapterConfig): void {
  if (!config.apiKey.trim() || !config.modelId.trim()) {
    throw new GeminiRequestError("Gemini API key and model ID are required.", "CONFIGURATION", false);
  }
  const timeoutMs = config.timeoutMs ?? 45_000;
  const maxOutputTokens = config.maxOutputTokens ?? 2048;
  const maxInputBytes = config.maxInputBytes ?? 128 * 1024;
  const maxAttempts = config.maxAttempts ?? 2;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180_000) {
    throw new GeminiRequestError("timeoutMs must be between 1000 and 180000.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 32_768) {
    throw new GeminiRequestError("maxOutputTokens must be between 1 and 32768.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1024 || maxInputBytes > 2 * 1024 * 1024) {
    throw new GeminiRequestError("maxInputBytes must be between 1 KiB and 2 MiB.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new GeminiRequestError("maxAttempts must be between 1 and 3.", "CONFIGURATION", false);
  }
}

function buildPrompt(task: Task, maxBytes: number): { text: string; redacted: boolean } {
  const serialized = JSON.stringify({
    taskId: task.id,
    title: task.title,
    description: task.description,
    kind: task.kind,
    requirementIds: task.requirementIds,
    dependencies: task.dependsOn,
    context: task.context,
    contextRefs: task.contextRefs
  });
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new GeminiRequestError("Task context exceeds configured input size limit.", "CONFIGURATION", false);
  }
  const safe = redactPotentialSecrets(serialized, { maxInputBytes: maxBytes });
  return { text: safe.text, redacted: safe.changed };
}

async function readBoundedBody(response: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GeminiRequestError("Gemini response exceeded the 2 MiB safety limit.", "INVALID_RESPONSE", false);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function parseResponse(value: unknown): {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  finishReason?: string;
} {
  if (!value || typeof value !== "object") {
    throw new GeminiRequestError("Gemini returned a non-object response.", "INVALID_RESPONSE", false);
  }
  const payload = value as Record<string, unknown>;
  const promptFeedback = payload.promptFeedback && typeof payload.promptFeedback === "object"
    ? payload.promptFeedback as Record<string, unknown> : {};
  if (typeof promptFeedback.blockReason === "string" && promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED") {
    throw new GeminiRequestError("Gemini blocked the prompt: " + promptFeedback.blockReason + ".", "SAFETY_BLOCK", false);
  }
  if (!Array.isArray(payload.candidates) || !payload.candidates.length || !payload.candidates[0] || typeof payload.candidates[0] !== "object") {
    throw new GeminiRequestError("Gemini response contains no candidate.", "INVALID_RESPONSE", false);
  }
  const candidate = payload.candidates[0] as Record<string, unknown>;
  const finishReason = typeof candidate.finishReason === "string" ? candidate.finishReason : undefined;
  if (finishReason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"].includes(finishReason)) {
    throw new GeminiRequestError("Gemini did not return task text because the candidate finish reason was " + finishReason + ".", "SAFETY_BLOCK", false);
  }
  const candidateContent = candidate.content && typeof candidate.content === "object"
    ? candidate.content as Record<string, unknown> : {};
  const parts = Array.isArray(candidateContent.parts) ? candidateContent.parts : [];
  const texts = parts.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const item = part as Record<string, unknown>;
    return typeof item.text === "string" ? [item.text] : [];
  });
  if (!texts.length) {
    throw new GeminiRequestError("Gemini candidate contains no text parts.", "INVALID_RESPONSE", false);
  }
  const usage = payload.usageMetadata && typeof payload.usageMetadata === "object"
    ? payload.usageMetadata as Record<string, unknown> : {};
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const inputTokens = count(usage.promptTokenCount);
  const outputTokens = count(usage.candidatesTokenCount);
  const totalTokens = count(usage.totalTokenCount);
  return {
    text: texts.join("\n"),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(finishReason ? { finishReason } : {})
  };
}

function emit(config: GeminiAdapterConfig, event: ProviderTelemetryEvent): void {
  try { config.onTelemetry?.(event); } catch { /* Telemetry must not change task execution. */ }
}

function endpoint(modelId: string): string {
  const normalized = modelId.replace(/^models\//, "");
  return "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(normalized) + ":generateContent";
}

export function createGeminiExecutor(config: GeminiAdapterConfig): TaskExecutor {
  validateConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async execute(task: Task, provider: string, modelId: string): Promise<TaskResult> {
      if (provider !== "gemini" || modelId !== config.modelId) {
        return {
          taskId: task.id, provider, modelId, status: "skipped",
          summary: "Configured Gemini adapter does not match the selected provider/model.",
          evidence: [], errors: ["ADAPTER_MISMATCH"]
        };
      }
      const prompt = buildPrompt(task, config.maxInputBytes ?? 128 * 1024);
      const attempts = config.maxAttempts ?? 2;
      let lastError: GeminiRequestError | undefined;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const started = Date.now();
        let status: number | undefined;
        let headers: Headers | undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 45_000);
        try {
          const response = await fetchImpl(endpoint(config.modelId), {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              "x-goog-api-key": config.apiKey,
              "content-type": "application/json",
              "accept": "application/json"
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: buildModelExecutionInstructions("gemini", task) + "\n\nYou are a text-only task worker. Do not execute actions; provide analysis or a proposal for the host to review." }] },
              contents: [{ role: "user", parts: [{ text: "Analyze this task and return a useful implementation or analysis proposal. The host will review all output.\n" + prompt.text }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: config.maxOutputTokens ?? 2048 }
            })
          });
          status = response.status;
          headers = response.headers;
          if (response.status === 401 || response.status === 403) {
            throw new GeminiRequestError("Gemini rejected the configured credentials or permissions.", "AUTHENTICATION", false, response.status);
          }
          if (response.status === 429) {
            throw new GeminiRequestError("Gemini rate limit reached.", "RATE_LIMITED", true, response.status);
          }
          if (response.status >= 500) {
            throw new GeminiRequestError("Gemini service returned a temporary error.", "REMOTE_ERROR", true, response.status);
          }
          if (!response.ok) {
            throw new GeminiRequestError("Gemini request failed with HTTP " + response.status + ".", "REMOTE_ERROR", false, response.status);
          }
          const responseText = await readBoundedBody(response);
          let payload: unknown;
          try { payload = JSON.parse(responseText); }
          catch { throw new GeminiRequestError("Gemini returned invalid JSON.", "INVALID_RESPONSE", false, response.status); }
          const normalized = parseResponse(payload);
          const safeOutput = redactPotentialSecrets(normalized.text, { maxInputBytes: 2 * 1024 * 1024 });
          const rateLimit = (() => {
            const number = (name: string) => {
              const raw = response.headers.get(name);
              if (raw === null) return undefined;
              const value = Number(raw);
              return Number.isFinite(value) && value >= 0 ? value : undefined;
            };
            const limit = number("x-ratelimit-limit-requests");
            const remaining = number("x-ratelimit-remaining-requests");
            const retryRaw = response.headers.get("retry-after");
            const retrySeconds = retryRaw === null ? undefined : Number(retryRaw);
            const result = {
              ...(limit !== undefined ? { limit } : {}),
              ...(remaining !== undefined ? { remaining } : {}),
              ...(retrySeconds !== undefined && Number.isFinite(retrySeconds) && retrySeconds >= 0 ? { retryAfterMs: Math.min(retrySeconds * 1000, 30_000) } : {})
            };
            return Object.keys(result).length ? result : undefined;
          })();
          emit(config, {
            provider: "gemini", modelId: config.modelId, outcome: "success",
            elapsedMs: Date.now() - started, attempt, status: response.status,
            ...(normalized.inputTokens !== undefined ? { inputTokens: normalized.inputTokens } : {}),
            ...(normalized.outputTokens !== undefined ? { outputTokens: normalized.outputTokens } : {}),
            ...(normalized.totalTokens !== undefined ? { totalTokens: normalized.totalTokens } : {}),
            ...(rateLimit ? { rateLimit } : {})
          });
          return {
            taskId: task.id, provider, modelId, status: "success",
            summary: safeOutput.text,
            evidence: [
              "Gemini generateContent API response received.",
              ...(prompt.redacted ? ["Potential secrets were redacted from outbound task context."] : []),
              ...(safeOutput.changed ? ["Potential secrets were redacted from model output."] : []),
              ...(normalized.finishReason ? ["Provider finish reason: " + normalized.finishReason + "."] : [])
            ],
            ...(normalized.inputTokens !== undefined ? { inputTokens: normalized.inputTokens } : {}),
            ...(normalized.outputTokens !== undefined ? { outputTokens: normalized.outputTokens } : {}),
            ...(normalized.totalTokens !== undefined ? { totalTokens: normalized.totalTokens } : {})
          };
        } catch (error) {
          const normalizedError = error instanceof GeminiRequestError ? error
            : controller.signal.aborted
              ? new GeminiRequestError("Gemini request timed out.", "TIMEOUT", true)
              : new GeminiRequestError("Gemini request failed due to a network error.", "NETWORK_ERROR", true);
          lastError = normalizedError;
          emit(config, {
            provider: "gemini", modelId: config.modelId, outcome: "failure",
            elapsedMs: Date.now() - started, attempt,
            ...(status !== undefined ? { status } : {}),
            ...(headers ? { rateLimit: { ...(headers.get("retry-after") ? { reset: headers.get("retry-after")! } : {}) } } : {})
          });
          if (!normalizedError.retryable || attempt === attempts) break;
        } finally {
          clearTimeout(timer);
        }
      }
      return {
        taskId: task.id, provider, modelId, status: "failure",
        summary: "Gemini request did not complete successfully.",
        evidence: [], errors: [lastError?.code ?? "UNKNOWN_PROVIDER_ERROR", lastError?.message ?? "Unknown Gemini error."]
      };
    }
  };
}

export async function discoverGeminiModels(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxModels?: number;
}): Promise<ModelDiscoveryResult> {
  if (!options.apiKey.trim()) throw new Error("Gemini API key is required.");
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxModels = options.maxModels ?? 500;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) throw new Error("timeoutMs must be between 1000 and 60000.");
  if (!Number.isInteger(maxModels) || maxModels < 1 || maxModels > 2000) throw new Error("maxModels must be between 1 and 2000.");
  const models: ModelDiscoveryResult["models"] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10 && models.length < maxModels; page++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", String(Math.min(100, maxModels - models.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (options.fetchImpl ?? fetch)(url, {
        method: "GET", redirect: "error", signal: controller.signal,
        headers: { "x-goog-api-key": options.apiKey, accept: "application/json" }
      });
      if (response.status === 401 || response.status === 403) throw new Error("Gemini rejected the configured credentials or permissions.");
      if (!response.ok) throw new Error("Gemini model discovery failed with HTTP " + response.status + ".");
      const raw = await readBoundedBody(response);
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { throw new Error("Gemini model discovery returned invalid JSON."); }
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>).models)) {
        throw new Error("Gemini model discovery returned an unsupported schema.");
      }
      for (const item of (payload as { models: unknown[] }).models) {
        if (!item || typeof item !== "object") continue;
        const model = item as Record<string, unknown>;
        if (typeof model.name !== "string" || !model.name.trim()) continue;
        const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
        if (!methods.includes("generateContent")) continue;
        models.push({
          id: model.name.replace(/^models\//, ""),
          ...(typeof model.version === "string" ? { ownedBy: model.version } : {})
        });
        if (models.length >= maxModels) break;
      }
      pageToken = typeof (payload as Record<string, unknown>).nextPageToken === "string"
        ? (payload as Record<string, unknown>).nextPageToken as string : undefined;
      if (!pageToken) break;
    } finally {
      clearTimeout(timer);
    }
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return { provider: "gemini", models, fetchedAt: new Date().toISOString() };
}
