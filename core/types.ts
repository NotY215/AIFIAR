import type { SkillLevel, TaskKind } from "../models/registry.js";

export interface Requirement {
  id: string;
  text: string;
  mandatory: boolean;
  status: "pending" | "addressed" | "blocked" | "verified";
  evidence?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  kind: TaskKind;
  requirementIds: string[];
  dependsOn: string[];
  suggestedProviders?: string[];
  protectedPaths?: string[];
  context?: string;
  contextRefs?: string[];
  status: "pending" | "ready" | "running" | "completed" | "failed" | "blocked";
}

export interface ProjectFileSummary {
  path: string;
  purpose: string;
  lastObservedAt: string;
  generatedAt?: string;
  contentHash?: string;
}

export interface WorkPlan {
  goal: string;
  skillLevel: SkillLevel;
  requirements: Requirement[];
  tasks: Task[];
  warnings: string[];
}

export interface TaskResult {
  taskId: string;
  provider: string;
  modelId: string;
  status: "success" | "failure" | "skipped";
  summary: string;
  evidence: string[];
  proposedPatchRefs?: string[];
  errors?: string[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
