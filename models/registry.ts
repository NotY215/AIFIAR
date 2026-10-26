export type SkillLevel = "beginner" | "intermediate" | "expert";
export type TaskKind = "repository-analysis" | "research" | "planning" | "coding" | "review" | "testing" | "documentation" | "general";

export interface ModelCapabilities {
  provider: string;
  modelId: string;
  taskKinds: TaskKind[];
  contextWindowTokens?: number;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportedApiModes?: Array<"chat-completions" | "responses">;
  supportsModelDiscovery?: boolean;
  availability: "available" | "unconfigured" | "unavailable";
  notes?: string;
}

export interface ModelRegistry {
  list(): readonly ModelCapabilities[];
  get(provider: string, modelId: string): ModelCapabilities | undefined;
}

export class StaticModelRegistry implements ModelRegistry {
  constructor(private readonly models: readonly ModelCapabilities[]) {}
  list(): readonly ModelCapabilities[] { return this.models; }
  get(provider: string, modelId: string): ModelCapabilities | undefined {
    return this.models.find((m) => m.provider === provider && m.modelId === modelId);
  }
}
