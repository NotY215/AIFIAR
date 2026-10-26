import type { ModelCapabilities, ModelRegistry } from "./registry.js";
import { StaticModelRegistry } from "./registry.js";
import type { TaskExecutor } from "../core/orchestrator.js";
import type { Task, TaskResult } from "../core/types.js";
import { createOpenAIExecutor, createXAIExecutor } from "./openaiCompatibleAdapter.js";

export interface ProviderRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
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
  if (openAIKey && openAIModel) {
    models.push({ provider: "openai", modelId: openAIModel, taskKinds: [...taskKinds], supportsTools: false, supportsStructuredOutput: false, availability: "available", notes: "Text-only Chat Completions adapter. Does not execute tools." });
    executors.set("openai\u0000" + openAIModel, createOpenAIExecutor(openAIKey, openAIModel, options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}));
  } else {
    models.push({ provider: "openai", modelId: openAIModel || "unconfigured", taskKinds: [...taskKinds], supportsTools: false, supportsStructuredOutput: false, availability: "unconfigured", notes: "Set OPENAI_API_KEY and AIFIAR_OPENAI_MODEL to enable this provider." });
  }

  const xaiKey = env.XAI_API_KEY?.trim();
  const xaiModel = env.AIFIAR_XAI_MODEL?.trim();
  if (xaiKey && xaiModel) {
    models.push({ provider: "xai", modelId: xaiModel, taskKinds: [...taskKinds], supportsTools: false, supportsStructuredOutput: false, availability: "available", notes: "Text-only Chat Completions adapter. Does not execute tools." });
    executors.set("xai\u0000" + xaiModel, createXAIExecutor(xaiKey, xaiModel, options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}));
  } else {
    models.push({ provider: "xai", modelId: xaiModel || "unconfigured", taskKinds: [...taskKinds], supportsTools: false, supportsStructuredOutput: false, availability: "unconfigured", notes: "Set XAI_API_KEY and AIFIAR_XAI_MODEL to enable this provider." });
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