import type { Task, TaskResult } from "../../core/types.js";

/** Interface contract only. This scaffold does not call a live GPT API. */
export interface GptAdapter {
  readonly provider: "gpt";
  execute(task: Task, modelId: string, context: string): Promise<TaskResult>;
}

export const GPT_ADAPTER_STATUS = "interface-only" as const;
