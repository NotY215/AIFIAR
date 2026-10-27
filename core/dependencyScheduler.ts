import type { Task } from "./types.js";

export function getReadyTasks(tasks: readonly Task[], completedTaskIds: ReadonlySet<string>, runningTaskIds: ReadonlySet<string> = new Set()): Task[] {
  return tasks.filter((task) =>
    (task.status === "pending" || task.status === "ready") &&
    !completedTaskIds.has(task.id) &&
    !runningTaskIds.has(task.id) &&
    task.dependsOn.every((id) => completedTaskIds.has(id))
  );
}

export function findDependencyCycles(tasks: readonly Task[]): string[][] {
  const graph = new Map<string, string[]>(tasks.map((task) => [task.id, task.dependsOn] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  function visit(id: string): void {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id); stack.push(id);
    for (const dependency of graph.get(id) ?? []) if (graph.has(dependency)) visit(dependency);
    stack.pop(); visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
  return cycles;
}
