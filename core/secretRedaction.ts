export interface SecretFinding {
  kind: string;
  start: number;
  end: number;
}

export interface RedactionResult {
  text: string;
  findings: SecretFinding[];
  changed: boolean;
}

const DETECTORS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "private-key", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\\s\\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
  { kind: "github-token", pattern: /\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b/g },
  { kind: "aws-access-key", pattern: /\\bAKIA[0-9A-Z]{16}\\b/g },
  { kind: "generic-api-key", pattern: /\\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\\s*[:=]\\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/gi },
  { kind: "bearer-token", pattern: /\\bBearer\\s+[A-Za-z0-9._~+/-]{16,}=*/gi },
  { kind: "connection-string-password", pattern: /\\b(password|pwd)\\s*=\\s*[^;\\s]+/gi }
];

export function findPotentialSecrets(input: string, maxInputBytes = 2 * 1024 * 1024): SecretFinding[] {
  if (Buffer.byteLength(input, "utf8") > maxInputBytes) throw new Error("Secret scan input exceeds configured size limit.");
  const findings: SecretFinding[] = [];
  for (const detector of DETECTORS) {
    detector.pattern.lastIndex = 0;
    for (const match of input.matchAll(detector.pattern)) {
      const start = match.index ?? 0;
      findings.push({ kind: detector.kind, start, end: start + match[0].length });
    }
  }
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: SecretFinding[] = [];
  for (const finding of findings) {
    const last = merged[merged.length - 1];
    if (last && finding.start < last.end) {
      last.end = Math.max(last.end, finding.end);
      if (!last.kind.split("+").includes(finding.kind)) last.kind += "+" + finding.kind;
    } else merged.push({ ...finding });
  }
  return merged;
}

export function redactPotentialSecrets(input: string, options: { replacement?: string; maxInputBytes?: number } = {}): RedactionResult {
  const findings = findPotentialSecrets(input, options.maxInputBytes);
  if (!findings.length) return { text: input, findings, changed: false };
  const replacement = options.replacement ?? "[REDACTED]";
  let output = input;
  for (const finding of [...findings].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, finding.start) + replacement + output.slice(finding.end);
  }
  return { text: output, findings, changed: true };
}
