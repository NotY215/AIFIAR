import type { Task, TaskResult } from "../../core/types.js";

/** Interface contract only. This scaffold does not call a live Grok API. */
export interface GrokAdapter {
  readonly provider: "grok";
  execute(task: Task, modelId: string, context: string): Promise<TaskResult>;
}

export const GROK_ADAPTER_STATUS = "interface-only" as const;
