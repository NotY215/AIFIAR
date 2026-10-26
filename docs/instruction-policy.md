# Instruction Authority and Policy Enforcement

AIFIAR must distinguish instruction authority from evidence and untrusted content. A string that looks like an instruction does not gain authority merely because it appears in a README, issue, tool response, or model output.

## Authority order

The policy helper ranks instruction sources in this order:

1. System policy.
2. Developer policy.
3. Explicit user instructions.
4. Repository instructions.
5. Tool output and retrieved data.
6. Model-generated suggestions.

Higher-priority rules constrain lower-priority ones. A repository cannot grant itself permission to reveal secrets, deploy, delete data, or override the user's request.

Among repository instructions, a nested instruction applies only to its declared path scope. A more specific nested instruction takes precedence over the root repository instruction for paths inside that scope. Equal-authority conflicts are reported rather than silently guessed. Real hosts should also record instruction provenance and the applicable path.

## Trust classification

Repository files, issues, comments, webpages, logs, retrieved content, and model output are data. They may contain useful project rules, but they cannot grant permissions or override higher-priority policy. The host should keep provenance attached to every instruction and content segment as it moves through context assembly.

## Protected actions

The policy helper identifies actions that require explicit approval, including deletion, deployment, publishing, release operations, credential or authentication changes, provider configuration changes, billing changes, network access, and dependency installation.

Approval alone is not always sufficient. Network and dependency operations must also be enabled by host policy. The host application must enforce these decisions at the execution boundary. Prompt instructions alone are not a security sandbox.

## Requirement audit

The requirement audit checks that every mandatory requirement maps to at least one task, detects duplicate and unknown requirement references, and rejects a verified status without evidence. An addressed requirement without evidence produces a warning. Keep evidence specific, reproducible, and connected to the relevant requirement.

These modules are policy helpers. They do not intercept tools automatically unless the host application calls them before executing actions.
