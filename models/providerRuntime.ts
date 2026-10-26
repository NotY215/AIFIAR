import type { ModelCapabilities, ModelRegistry } from "./registry.js";
import { StaticModelRegistry } from "./registry.js";
import type { TaskExecutor } from "../core/orchestrator.js";
import type { Task, TaskResult } from "../core/types.js";
import { createOpenAIExecutor, createXAIExecutor } from "./openaiCompatibleAdapter.js";
import { createOpenAIResponsesExecutor } from "./openAIResponsesAdapter.js";
import type { ProviderTelemetryEvent } from "./providerTelemetry.js";

export interface ProviderRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: ProviderTelemetryEvent) => void;
}
export interface ProviderRuntime {
  registry: ModelRegistry;
  executor: TaskExecutor;
  configuredProviders: string[];
}
const taskKinds: ModelCapabilities["taskKinds"] = [
  "repository-analysis", "research", "planning", "coding", "review", "testing", "documentation", "general"
];
export function createProviderRuntime(options: ProviderRuntimeOptions = {}): ProviderRuntime {
  const env = options.env ?? process.env;
  const models: ModelCapabilities[] = [];
  const executors = new Map<string, TaskExecutor>();
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
    const telemetry = options.onTelemetry ? { onTelemetry: options.onTelemetry } : {};
    const fetchOption = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
    const executor = openAIMode === "responses"
      ? createOpenAIResponsesExecutor({ apiKey: openAIKey, modelId, ...fetchOption, ...telemetry })
      : createOpenAIExecutor(openAIKey, modelId, { ...fetchOption, ...telemetry });
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
    const telemetry = options.onTelemetry ? { onTelemetry: options.onTelemetry } : {};
    const fetchOption = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
    executors.set("xai\u0000" + xaiModel, createXAIExecutor(xaiKey, xaiModel, { ...fetchOption, ...telemetry }));
  } else {
    models.push({
      provider: "xai", modelId: xaiModel || "unconfigured", taskKinds: [...taskKinds],
      supportsTools: false, supportsStructuredOutput: false,
      supportedApiModes: ["chat-completions"], supportsModelDiscovery: Boolean(xaiKey),
      availability: "unconfigured", notes: "Set XAI_API_KEY and AIFIAR_XAI_MODEL to enable xAI."
    });
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
    configuredProviders: [...new Set(models.filter((model) => model.availability === "available").map((model) => model.provider))]
  };
}
