import type { ModelCapabilities, ModelRegistry } from "./registry.js";
import { StaticModelRegistry } from "./registry.js";
import type { TaskExecutor } from "../core/orchestrator.js";
import type { Task, TaskResult } from "../core/types.js";
import { createOpenAIExecutor, createXAIExecutor, createOpenAICompatibleExecutor } from "./openaiCompatibleAdapter.js";
import { createOpenAIResponsesExecutor } from "./openAIResponsesAdapter.js";
import { createAnthropicExecutor } from "./anthropicAdapter.js";
import { createGeminiExecutor, discoverGeminiModels } from "./geminiAdapter.js";
import { InMemoryProviderTelemetry, type ProviderTelemetryEvent } from "./providerTelemetry.js";
import { discoverModels as fetchModels, type ModelDiscoveryResult } from "./providerDiscovery.js";

export interface ProviderRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: ProviderTelemetryEvent) => void;
}
export interface ProviderRuntime {
  registry: ModelRegistry;
  executor: TaskExecutor;
  configuredProviders: string[];
  telemetry: InMemoryProviderTelemetry;
  discoverModels(provider: "openai" | "xai" | "qwen" | "qwen-code" | "gemini" | "local"): Promise<ModelDiscoveryResult>;
}
const taskKinds: ModelCapabilities["taskKinds"] = [
  "repository-analysis", "research", "planning", "coding", "review", "testing", "documentation", "general"
];
export function createProviderRuntime(options: ProviderRuntimeOptions = {}): ProviderRuntime {
  const env = options.env ?? process.env;
  const models: ModelCapabilities[] = [];
  const executors = new Map<string, TaskExecutor>();
  const telemetry = new InMemoryProviderTelemetry();
  const onTelemetry = (event: ProviderTelemetryEvent) => {
    telemetry.record(event);
    try { options.onTelemetry?.(event); } catch { /* External telemetry must not break execution. */ }
  };
  const fetchOption = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
  const telemetryOption = { onTelemetry };
  const openAIKey = env.OPENAI_API_KEY?.trim();
  const openAIModel = env.AIFIAR_OPENAI_MODEL?.trim();
  const openAIResponsesModel = env.AIFIAR_OPENAI_RESPONSES_MODEL?.trim() || openAIModel;
  const openAIMode = env.AIFIAR_OPENAI_API_MODE?.trim().toLowerCase() || "chat-completions";
  if (openAIMode !== "chat-completions" && openAIMode !== "responses") throw new Error("AIFIAR_OPENAI_API_MODE must be chat-completions or responses.");
  if (openAIKey && (openAIMode === "responses" ? openAIResponsesModel : openAIModel)) {
    const modelId = openAIMode === "responses" ? openAIResponsesModel! : openAIModel!;
    models.push({
      provider: "openai", modelId, taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: [openAIMode], supportsModelDiscovery: true,
      availability: "available",
      notes: openAIMode === "responses"
        ? "Text-only OpenAI Responses API adapter. Does not execute tools."
        : "Text-only OpenAI Chat Completions adapter. Does not execute tools."
    });
    const executor = openAIMode === "responses"
      ? createOpenAIResponsesExecutor({ apiKey: openAIKey, modelId, ...fetchOption, ...telemetryOption })
      : createOpenAIExecutor(openAIKey, modelId, { ...fetchOption, ...telemetryOption });
    executors.set("openai\u0000" + modelId, executor);
  } else {
    models.push({
      provider: "openai", modelId: (openAIMode === "responses" ? openAIResponsesModel : openAIModel) || "unconfigured",
      taskKinds: [...taskKinds], supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: [openAIMode], supportsModelDiscovery: Boolean(openAIKey),
      availability: "unconfigured",
      notes: openAIMode === "responses"
        ? "Set OPENAI_API_KEY and AIFIAR_OPENAI_RESPONSES_MODEL (or AIFIAR_OPENAI_MODEL) to enable Responses API."
        : "Set OPENAI_API_KEY and AIFIAR_OPENAI_MODEL to enable Chat Completions."
    });
  }
  const xaiKey = env.XAI_API_KEY?.trim();
  const xaiModel = env.AIFIAR_XAI_MODEL?.trim();
  if (xaiKey && xaiModel) {
    models.push({
      provider: "xai", modelId: xaiModel, taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["chat-completions"], supportsModelDiscovery: true,
      availability: "available", notes: "Text-only xAI Chat Completions adapter. Does not execute tools."
    });
    executors.set("xai\u0000" + xaiModel, createXAIExecutor(xaiKey, xaiModel, { ...fetchOption, ...telemetryOption }));
  } else {
    models.push({
      provider: "xai", modelId: xaiModel || "unconfigured", taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["chat-completions"], supportsModelDiscovery: Boolean(xaiKey),
      availability: "unconfigured", notes: "Set XAI_API_KEY and AIFIAR_XAI_MODEL to enable xAI."
    });
  }
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = env.AIFIAR_ANTHROPIC_MODEL?.trim();
  if (anthropicKey && anthropicModel) {
    models.push({
      provider: "anthropic", modelId: anthropicModel, taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["anthropic-messages"], supportsModelDiscovery: false,
      availability: "available", notes: "Text-only Anthropic Messages API adapter. Does not execute tools."
    });
    executors.set("anthropic\u0000" + anthropicModel, createAnthropicExecutor({
      apiKey: anthropicKey, modelId: anthropicModel, ...fetchOption, ...telemetryOption
    }));
  } else {
    models.push({
      provider: "anthropic", modelId: anthropicModel || "unconfigured", taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["anthropic-messages"], supportsModelDiscovery: false,
      availability: "unconfigured",
      notes: "Set ANTHROPIC_API_KEY and AIFIAR_ANTHROPIC_MODEL to enable Anthropic Claude."
    });
  }
  const geminiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  const geminiModel = env.AIFIAR_GEMINI_MODEL?.trim();
  if (geminiKey && geminiModel) {
    models.push({
      provider: "gemini", modelId: geminiModel, taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["gemini-generate-content"], supportsModelDiscovery: true,
      availability: "available", notes: "Text-only Google Gemini generateContent adapter. No provider-side tools or browsing are enabled."
    });
    executors.set("gemini\u0000" + geminiModel, createGeminiExecutor({
      apiKey: geminiKey, modelId: geminiModel, ...fetchOption, ...telemetryOption
    }));
  } else {
    models.push({
      provider: "gemini", modelId: geminiModel || "unconfigured", taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["gemini-generate-content"], supportsModelDiscovery: Boolean(geminiKey),
      availability: "unconfigured",
      notes: "Set GEMINI_API_KEY (or GOOGLE_API_KEY) and AIFIAR_GEMINI_MODEL to enable Google Gemini."
    });
  }
  const qwenKey = env.DASHSCOPE_API_KEY?.trim();
  const qwenBaseUrl = env.AIFIAR_QWEN_BASE_URL?.trim();
  const qwenModels = [
    { provider: "qwen", modelId: env.AIFIAR_QWEN_MODEL?.trim(), label: "general analysis and research" },
    { provider: "qwen-code", modelId: env.AIFIAR_QWEN_CODE_MODEL?.trim(), label: "coding and repository integration" }
  ];
  for (const entry of qwenModels) {
    const configured = Boolean(qwenKey && qwenBaseUrl && entry.modelId);
    models.push({
      provider: entry.provider,
      modelId: entry.modelId || "unconfigured",
      taskKinds: [...taskKinds],
      supportsTools: false,
      supportsStructuredOutput: false,
      supportedApiModes: ["chat-completions"],
      supportsModelDiscovery: Boolean(qwenKey && qwenBaseUrl),
      availability: configured ? "available" : "unconfigured",
      notes: configured
        ? "Text-only Qwen OpenAI-compatible Chat Completions adapter (" + entry.label + "). No provider-side tools or web search are enabled."
        : "Set DASHSCOPE_API_KEY, AIFIAR_QWEN_BASE_URL, and " + (entry.provider === "qwen" ? "AIFIAR_QWEN_MODEL" : "AIFIAR_QWEN_CODE_MODEL") + " to enable this Qwen profile."
    });
    if (configured) {
      executors.set(entry.provider + "\u0000" + entry.modelId, createOpenAICompatibleExecutor({
        provider: entry.provider,
        modelId: entry.modelId!,
        apiKey: qwenKey!,
        baseUrl: qwenBaseUrl!,
        ...fetchOption,
        ...telemetryOption
      }));
    }
  }
  const localBaseUrl = env.AIFIAR_LOCAL_BASE_URL?.trim();
  const localModel = env.AIFIAR_LOCAL_MODEL?.trim();
  const localApiKey = env.AIFIAR_LOCAL_API_KEY?.trim();
  let localLoopback = false;
  if (localBaseUrl) {
    try {
      const localUrl = new URL(localBaseUrl);
      localLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(localUrl.hostname);
    } catch {
      // Invalid endpoint stays unconfigured; no request is attempted.
    }
  }
  const effectiveLocalKey = localApiKey || (localLoopback ? "local-no-auth" : undefined);
  const localConfigured = Boolean(localBaseUrl && localModel && effectiveLocalKey);
  models.push({
    provider: "local",
    modelId: localModel || "unconfigured",
    taskKinds: [...taskKinds],
    supportsTools: false,
    supportsStructuredOutput: false,
    supportedApiModes: ["chat-completions"],
    supportsModelDiscovery: Boolean(localBaseUrl && effectiveLocalKey),
    availability: localConfigured ? "available" : "unconfigured",
    notes: localConfigured
      ? "Text-only local/self-hosted OpenAI-compatible endpoint. No tools are executed; loopback HTTP is permitted only for local endpoints."
      : "Set AIFIAR_LOCAL_BASE_URL and AIFIAR_LOCAL_MODEL. Remote HTTPS endpoints also require AIFIAR_LOCAL_API_KEY; loopback endpoints may omit it."
  });
  if (localConfigured) {
    executors.set("local\u0000" + localModel, createOpenAICompatibleExecutor({
      provider: "local",
      modelId: localModel!,
      apiKey: effectiveLocalKey!,
      baseUrl: localBaseUrl!,
      ...fetchOption,
      ...telemetryOption
    }));
  }
  const executor: TaskExecutor = {
    execute(task: Task, provider: string, modelId: string): Promise<TaskResult> {
      const selected = executors.get(provider + "\u0000" + modelId);
      if (!selected) return Promise.resolve({
        taskId: task.id, provider, modelId, status: "skipped",
        summary: "No configured provider adapter matches this model.",
        evidence: [], errors: ["PROVIDER_NOT_CONFIGURED"]
      });
      return selected.execute(task, provider, modelId);
    }
  };
  return {
    registry: new StaticModelRegistry(models),
    executor,
    telemetry,
    discoverModels(provider: "openai" | "xai" | "qwen" | "qwen-code" | "gemini" | "local") {
      if (provider === "gemini") {
        if (!geminiKey) throw new Error("Gemini API credentials must be configured.");
        return discoverGeminiModels({ apiKey: geminiKey, ...fetchOption });
      }
      const apiKey = provider === "openai" ? openAIKey : provider === "xai" ? xaiKey
        : provider === "local" ? effectiveLocalKey : qwenKey;
      const baseUrl = provider === "openai" ? "https://api.openai.com/v1"
        : provider === "xai" ? "https://api.x.ai/v1"
        : provider === "local" ? localBaseUrl : qwenBaseUrl;
      if (!apiKey || !baseUrl) throw new Error("Provider credentials and base URL must be configured.");
      return fetchModels({ provider, apiKey, baseUrl, ...fetchOption });
    },
    configuredProviders: [...new Set(models.filter((model) => model.availability === "available").map((model) => model.provider))]
  };
}
