import { evaluateActionGate, type ActionGateInput } from "./actionGate.js";
import { checkPlannedFilesFresh, type CurrentFileState, type PlannedFileState } from "./fileFreshnessGate.js";
import { evaluateCommandRequest, type CommandPolicy, type CommandRequest } from "./commandPolicy.js";
import { redactPotentialSecrets } from "./secretRedaction.js";

export interface PreflightInput {
  action: ActionGateInput;
  plannedFiles?: readonly PlannedFileState[];
  currentFiles?: readonly CurrentFileState[];
  requireExactFileSet?: boolean;
  command?: { request: CommandRequest; policy: CommandPolicy };
  outboundText?: string;
  rejectOutboundSecrets?: boolean;
}

export interface PreflightReport {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  freshness?: ReturnType<typeof checkPlannedFilesFresh>;
  actionGate: ReturnType<typeof evaluateActionGate>;
  commandPolicy?: ReturnType<typeof evaluateCommandRequest>;
  outboundText?: string;
  redactedSecretCount: number;
}

export function runPreflight(input: PreflightInput): PreflightReport {
  const actionGate = evaluateActionGate(input.action);
  const blockers = [...actionGate.blockers];
  const warnings = [...actionGate.warnings];
  let freshness: ReturnType<typeof checkPlannedFilesFresh> | undefined;
  let commandPolicy: ReturnType<typeof evaluateCommandRequest> | undefined;
  let outboundText = input.outboundText;
  let redactedSecretCount = 0;

  if ((input.plannedFiles && !input.currentFiles) || (!input.plannedFiles && input.currentFiles)) {
    blockers.push("Both planned and current file states are required for freshness rechecking.");
  } else if (input.plannedFiles && input.currentFiles) {
    freshness = checkPlannedFilesFresh(input.plannedFiles, input.currentFiles, { requireExactSet: input.requireExactFileSet });
    blockers.push(...freshness.blockers);
  }
  if (input.command) {
    commandPolicy = evaluateCommandRequest(input.command.request, input.command.policy);
    blockers.push(...commandPolicy.blockers);
    warnings.push(...commandPolicy.warnings);
  }
  if (outboundText !== undefined) {
    const redacted = redactPotentialSecrets(outboundText);
    redactedSecretCount = redacted.findings.length;
    if (redacted.changed) {
      if (input.rejectOutboundSecrets === true) blockers.push("Outbound content contains potential secrets and was not approved for transmission.");
      else {
        outboundText = redacted.text;
        warnings.push("Potential secrets were redacted from outbound content.");
      }
    }
  }
  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    ...(freshness ? { freshness } : {}),
    actionGate,
    ...(commandPolicy ? { commandPolicy } : {}),
    ...(outboundText !== undefined ? { outboundText } : {}),
    redactedSecretCount
  };
}
