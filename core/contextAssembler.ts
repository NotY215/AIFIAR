export interface ContextRequirement {
  id: string;
  text: string;
}

export interface ContextSource {
  id: string;
  text: string;
  requirementIds: string[];
  path?: string;
  contentHash?: string;
  current: boolean;
}

export interface AssembledContext {
  requirementText: string[];
  sourceText: string[];
  excludedStaleSourceIds: string[];
  missingRequirementIds: string[];
}

export function assembleTaskContext(
  required: readonly ContextRequirement[],
  sources: readonly ContextSource[],
  taskRequirementIds: readonly string[]
): AssembledContext {
  const requested = new Set(taskRequirementIds);
  const selectedRequirements = required.filter((item) => requested.has(item.id));
  const missingRequirementIds = taskRequirementIds.filter((id) => !required.some((item) => item.id === id));
  const sourceText: string[] = [];
  const excludedStaleSourceIds: string[] = [];

  for (const source of sources) {
    if (!source.requirementIds.some((id) => requested.has(id))) continue;
    if (!source.current) {
      excludedStaleSourceIds.push(source.id);
      continue;
    }
    sourceText.push(`[Source ${source.id}${source.path ? ` | ${source.path}` : ""}${source.contentHash ? ` | hash ${source.contentHash}` : ""}]\n${source.text}`);
  }

  return {
    requirementText: selectedRequirements.map((item) => `[${item.id}] ${item.text}`),
    sourceText,
    excludedStaleSourceIds,
    missingRequirementIds
  };
}
