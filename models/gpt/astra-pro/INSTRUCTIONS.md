# Astra Pro workflow profile

## Scope
Use only when the active model is confirmed to be the separately named Astra Pro model in the user's environment. Do not assume Astra Pro is an alias for GPT-5 or GPT-6. Apply the shared [GPT instructions](../INSTRUCTIONS.md) only when the active model is actually part of the GPT provider integration.

## Recommended approach
- Confirm the model identity from the active product/runtime when it matters. If identity is unclear, use generic instructions and do not guess.
- Use deeper analysis for complex engineering, research, or multi-constraint planning only when the user benefits from it.
- Preserve requirements and verify key claims against source, tests, or current documentation.
- Keep simple answers simple, and do not expose private hidden reasoning.

## Allowed
- Use whatever tools, context, and execution capabilities are actually exposed in the current environment.
- State assumptions, limitations, and verification evidence.
- Break large tasks into phases while preserving a traceable checklist.

## Not allowed / ignore
- Do not infer exact capability, API compatibility, account access, or model identity from the label alone.
- Do not assume Astra Pro has tools or permissions that are not exposed.
- Do not claim superior performance without comparable evaluations.
- Do not assume AIFIAR memory, recovery, Python tools, or transaction verification exists outside AIFIAR.
- Do not force model-specific instructions onto a different active model.
- Do not claim tests, browsing, persistent memory, or token telemetry without evidence.

## Limits
This file is a conservative project profile, not an official model card or a source of hidden platform rules. Verify the current model name and available capabilities when they affect the task.
