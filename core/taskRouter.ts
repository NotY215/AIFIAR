import type { ModelRegistry, ModelCapabilities } from "../models/registry.js";
import type { Task } from "./types.js";

export interface RoutingConstraints {
  allowedProviders?: string[];
  excludedProviders?: string[];
  requireTools?: boolean;
}

export function routeTask(task: Task, registry: ModelRegistry, constraints: RoutingConstraints = {}): ModelCapabilities[] {
  return registry.list()
    .filter((model) => model.availability === "available")
    .filter((model) => model.taskKinds.includes(task.kind) || model.taskKinds.includes("general"))
    .filter((model) => !constraints.allowedProviders || constraints.allowedProviders.includes(model.provider))
    .filter((model) => !constraints.excludedProviders?.includes(model.provider))
    .filter((model) => !constraints.requireTools || model.supportsTools)
    .sort((a, b) => Number(b.taskKinds.includes(task.kind)) - Number(a.taskKinds.includes(task.kind)));
}
