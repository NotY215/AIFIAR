import type { TaskResult } from "./types.js";

export interface MergedTaskResult {
  taskId: string;
  successful: TaskResult[];
  failed: TaskResult[];
  uniqueEvidence: string[];
  status: "success" | "partial" | "failure";
}

export function mergeTaskResults(taskId: string, results: readonly TaskResult[]): MergedTaskResult {
  const matching = results.filter((result) => result.taskId === taskId);
  const successful = matching.filter((result) => result.status === "success");
  const failed = matching.filter((result) => result.status !== "success");
  const uniqueEvidence = [...new Set(successful.flatMap((result) => result.evidence))];
  const status = successful.length === 0 ? "failure" : failed.length ? "partial" : "success";
  return { taskId, successful, failed, uniqueEvidence, status };
}
