import type { SkillLevel } from "../models/registry.js";

export interface ChangeProposal {
  path: string;
  action: "create" | "edit" | "delete" | "inspect";
  purpose: string;
  risk?: "low" | "medium" | "high";
  requiresApproval?: boolean;
}

export interface ProposalSummary {
  goal: string;
  changes: ChangeProposal[];
  checks: string[];
  warnings: string[];
}

/**
 * Formats the same proposal at different detail levels. This changes presentation,
 * not the underlying requirements or plan.
 */
export function formatProposal(summary: ProposalSummary, level: SkillLevel = "intermediate"): string {
  if (level === "beginner") {
    const lines = [
      `Goal: ${summary.goal}`,
      "",
      "What will change:"
    ];
    for (const item of summary.changes) {
      lines.push(`- ${item.action} ${item.path}: ${item.purpose}${item.requiresApproval ? " (needs your approval)" : ""}`);
    }
    if (summary.warnings.length) lines.push("", "Things to know:", ...summary.warnings.map((warning) => `- ${warning}`));
    lines.push("", "Checks:", ...summary.checks.map((check) => `- ${check}`));
    return lines.join("\n");
  }

  if (level === "expert") {
    return JSON.stringify(summary, null, 2);
  }

  const lines = [
    `Goal: ${summary.goal}`,
    "",
    "Planned changes:",
    ...summary.changes.map((item) => `- ${item.action} ${item.path} [risk: ${item.risk ?? "unspecified"}]: ${item.purpose}${item.requiresApproval ? " (approval required)" : ""}`),
    "",
    "Verification:",
    ...summary.checks.map((check) => `- ${check}`)
  ];
  if (summary.warnings.length) lines.push("", "Warnings:", ...summary.warnings.map((warning) => `- ${warning}`));
  return lines.join("\n");
}
