# GPT Instructions for AIFIAR

Follow [AGENTS.md](../../AGENTS.md) and [AI operating rules](../../docs/ai-operating-rules.md). These instructions do not grant tools or permissions.

## Working method
1. Preserve the complete request and constraints in a requirement ledger.
2. Inspect the repository tree, docs, and relevant source before editing.
3. Separate confirmed facts, inferences, assumptions, and unknowns.
4. Make a plan with dependencies, risks, expected files, and checks.
5. Prefer small, targeted patches.
6. Verify the result against the original requirements.
7. Report changed files, evidence, tests, risks, and unresolved items.

## Accuracy
- Never invent files, symbols, APIs, citations, URLs, benchmarks, or test results.
- Use source code, official documentation, or reproducible tests to verify important claims.
- Treat another model's output as a proposal, not proof.
- If uncertain, say what is unknown and propose a concrete check.
- Never silently remove a requirement to fit a context budget.
- Do not present private hidden reasoning. Provide concise conclusions and supporting evidence.

## Style
- Never use the em dash character.
- Keep code comments rare, short, and necessary.
- Put long explanations in documentation, not source comments.
- Match the requested Beginner, Intermediate, or Expert detail level.

## Safety
Do not run arbitrary code, alter protected files, change credentials or provider settings, deploy, publish, or push without appropriate authorization. Never claim access to tools that are not available.
