import type { TaskExecutor } from "../core/orchestrator.js";
import { buildModelExecutionInstructions } from "../core/modelExecutionInstructions.js";
import { redactPotentialSecrets } from "../core/secretRedaction.js";
import type { Task, TaskResult } from "../core/types.js";
import type { ProviderTelemetryEvent } from "./providerTelemetry.js";

export interface AnthropicAdapterConfig {
  apiKey: string;
  modelId: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxInputBytes?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: ProviderTelemetryEvent) => void;
}

class AnthropicRequestError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIGURATION" | "INVALID_RESPONSE" | "AUTHENTICATION" | "RATE_LIMITED" | "REMOTE_ERROR" | "TIMEOUT" | "NETWORK_ERROR",
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message);
    this.name = "AnthropicRequestError";
  }
}

function validateConfig(config: AnthropicAdapterConfig): void {
  if (!config.apiKey.trim() || !config.modelId.trim()) {
    throw new AnthropicRequestError("Anthropic API key and model ID are required.", "CONFIGURATION", false);
  }
  const timeoutMs = config.timeoutMs ?? 45_000;
  const maxOutputTokens = config.maxOutputTokens ?? 2048;
  const maxInputBytes = config.maxInputBytes ?? 128 * 1024;
  const maxAttempts = config.maxAttempts ?? 2;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180_000) {
    throw new AnthropicRequestError("timeoutMs must be between 1000 and 180000.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 32_768) {
    throw new AnthropicRequestError("maxOutputTokens must be between 1 and 32768.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1024 || maxInputBytes > 2 * 1024 * 1024) {
    throw new AnthropicRequestError("maxInputBytes must be between 1 KiB and 2 MiB.", "CONFIGURATION", false);
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new AnthropicRequestError("maxAttempts must be between 1 and 3.", "CONFIGURATION", false);
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
    throw new AnthropicRequestError("Task context exceeds configured input size limit.", "CONFIGURATION", false);
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
        throw new AnthropicRequestError("Anthropic response exceeded the 2 MiB safety limit.", "INVALID_RESPONSE", false);
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
  stopReason?: string;
} {
  if (!value || typeof value !== "object") {
    throw new AnthropicRequestError("Anthropic returned a non-object response.", "INVALID_RESPONSE", false);
  }
  const payload = value as Record<string, unknown>;
  if (payload.type !== "message" || !Array.isArray(payload.content)) {
    throw new AnthropicRequestError("Anthropic response has an unsupported Messages API schema.", "INVALID_RESPONSE", false);
  }
  const textBlocks: string[] = [];
  for (const block of payload.content) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") textBlocks.push(item.text);
  }
  if (!textBlocks.length) {
    throw new AnthropicRequestError("Anthropic response contains no text blocks.", "INVALID_RESPONSE", false);
  }
  const usage = payload.usage && typeof payload.usage === "object"
    ? payload.usage as Record<string, unknown> : {};
  const validCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : undefined;
  const inputTokens = validCount(usage.input_tokens);
  const outputTokens = validCount(usage.output_tokens);
  return {
    text: textBlocks.join("\n"),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(typeof payload.stop_reason === "string" ? { stopReason: payload.stop_reason } : {})
  };
}

function emit(config: AnthropicAdapterConfig, event: ProviderTelemetryEvent): void {
  try { config.onTelemetry?.(event); } catch { /* Telemetry must not change task execution. */ }
}

export function createAnthropicExecutor(config: AnthropicAdapterConfig): TaskExecutor {
  validateConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async execute(task: Task, provider: string, modelId: string): Promise<TaskResult> {
      if (provider !== "anthropic" || modelId !== config.modelId) {
        return {
          taskId: task.id, provider, modelId, status: "skipped",
          summary: "Configured Anthropic adapter does not match the selected provider/model.",
          evidence: [], errors: ["ADAPTER_MISMATCH"]
        };
      }
      const prompt = buildPrompt(task, config.maxInputBytes ?? 128 * 1024);
      const attempts = config.maxAttempts ?? 2;
      let lastError: AnthropicRequestError | undefined;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const started = Date.now();
        let status: number | undefined;
        let headers: Headers | undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 45_000);
        try {
          const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
              "accept": "application/json"
            },
            body: JSON.stringify({
              model: config.modelId,
              max_tokens: config.maxOutputTokens ?? 2048,
              temperature: 0.1,
              system: buildModelExecutionInstructions("anthropic", task) + "\n\nYou are a text-only task worker. Do not execute actions; provide analysis or a proposal for the host to review.",
              messages: [{ role: "user", content: "Analyze this task and return a useful implementation or analysis proposal. The host will review all output.\n" + prompt.text }]
            })
          });
          status = response.status;
          headers = response.headers;
          if (response.status === 401 || response.status === 403) {
            throw new AnthropicRequestError("Anthropic rejected the configured credentials or permissions.", "AUTHENTICATION", false, response.status);
          }
          if (response.status === 429) {
            throw new AnthropicRequestError("Anthropic rate limit reached.", "RATE_LIMITED", true, response.status);
          }
          if (response.status >= 500) {
            throw new AnthropicRequestError("Anthropic service returned a temporary error.", "REMOTE_ERROR", true, response.status);
          }
          if (!response.ok) {
            throw new AnthropicRequestError("Anthropic request failed with HTTP " + response.status + ".", "REMOTE_ERROR", false, response.status);
          }
          let parsed: unknown;
          try { parsed = JSON.parse(await readBoundedBody(response)); }
          catch (error) {
            if (error instanceof AnthropicRequestError) throw error;
            throw new AnthropicRequestError("Anthropic returned invalid JSON.", "INVALID_RESPONSE", false, response.status);
          }
          const result = parseResponse(parsed);
          const safeOutput = redactPotentialSecrets(result.text, { maxInputBytes: 2 * 1024 * 1024 });
          const rateLimit = {
            ...(Number(response.headers.get("anthropic-ratelimit-requests-limit")) >= 0 && response.headers.get("anthropic-ratelimit-requests-limit") !== null
              ? { limit: Number(response.headers.get("anthropic-ratelimit-requests-limit")) } : {}),
            ...(Number(response.headers.get("anthropic-ratelimit-requests-remaining")) >= 0 && response.headers.get("anthropic-ratelimit-requests-remaining") !== null
              ? { remaining: Number(response.headers.get("anthropic-ratelimit-requests-remaining")) } : {}),
            ...(response.headers.get("retry-after") ? { retryAfterMs: Math.min(30_000, Math.max(0, Number(response.headers.get("retry-after")) * 1000)) } : {})
          };
          const inputTokens = result.inputTokens;
          const outputTokens = result.outputTokens;
          emit(config, {
            provider: "anthropic", modelId: config.modelId, outcome: "success",
            elapsedMs: Date.now() - started, attempt, status: response.status,
            ...(inputTokens !== undefined ? { inputTokens } : {}),
            ...(outputTokens !== undefined ? { outputTokens } : {}),
            ...(inputTokens !== undefined && outputTokens !== undefined ? { totalTokens: inputTokens + outputTokens } : {}),
            ...(Object.keys(rateLimit).length ? { rateLimit } : {})
          });
          const evidence = [
            "Anthropic Messages API response schema validated.",
            ...(prompt.redacted ? ["Potential secrets were redacted from task context before transmission."] : []),
            ...(safeOutput.changed ? ["Potential secrets were redacted from provider output."] : []),
            ...(result.stopReason ? ["Provider stop reason: " + result.stopReason + "."] : []),
            ...(inputTokens !== undefined && outputTokens !== undefined
              ? ["Anthropic reported " + inputTokens + " input tokens and " + outputTokens + " output tokens."] : [])
          ];
          return {
            taskId: task.id, provider: "anthropic", modelId: config.modelId,
            status: "success", summary: safeOutput.text.slice(0, 100_000), evidence
          };
        } catch (error) {
          emit(config, {
            provider: "anthropic", modelId: config.modelId, outcome: "failure",
            elapsedMs: Date.now() - started, attempt,
            ...(status !== undefined ? { status } : {})
          });
          if (error instanceof AnthropicRequestError) lastError = error;
          else if (controller.signal.aborted) lastError = new AnthropicRequestError("Anthropic request timed out.", "TIMEOUT", true);
          else lastError = new AnthropicRequestError("Anthropic network request failed.", "NETWORK_ERROR", true);
          if (!lastError.retryable || attempt >= attempts) break;
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
        } finally {
          clearTimeout(timer);
        }
      }
      const failure = lastError ?? new AnthropicRequestError("Anthropic request failed.", "NETWORK_ERROR", true);
      return {
        taskId: task.id, provider: "anthropic", modelId: config.modelId,
        status: "failure", summary: "Anthropic request failed.", evidence: [],
        errors: [failure.code + (failure.status ? " HTTP " + failure.status : "") + ": " + failure.message]
      };
    }
  };
}
