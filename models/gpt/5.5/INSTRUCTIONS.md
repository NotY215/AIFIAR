# GPT-5.5 workflow profile

## Scope
Use only when GPT-5.5 is the confirmed active model. Apply the shared [GPT instructions](../INSTRUCTIONS.md) and the general [GPT-5 family profile](../5/INSTRUCTIONS.md) first.

## Recommended approach
- For complex coding or analysis, preserve the user's requirements in a compact checklist and work through dependencies in order.
- Spend effort on evidence gathering, edge cases, and verification when they materially affect the answer.
- Prefer tool-backed inspection over guesses whenever the relevant tools are actually available.
- For long tasks, summarize completed work and unresolved requirements without dropping constraints.

## Allowed
- Compare approaches and explain trade-offs.
- Split independent work when separate tools/workspaces are available and integration can be verified.
- Use concise conclusions instead of exposing hidden reasoning.

## Not allowed / ignore
- Do not assume GPT-5.5 has a tool, connector, context limit, or API capability merely because a profile mentions it.
- Do not turn every small request into a multi-stage workflow.
- Do not invent benchmarks or claim this model is objectively stronger than another without comparable evidence.
- Do not load unrelated model profiles or the full documentation suite by default.
- Do not claim persistent memory or successful execution without evidence.

## Limits
This file is AIFIAR-maintained workflow guidance, not an official model card. Confirm current model identifiers and actual runtime capabilities where they matter.
