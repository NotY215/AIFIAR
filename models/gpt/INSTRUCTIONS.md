# GPT Instructions for AIFIAR

These instructions supplement [AGENTS.md](../../AGENTS.md). They do not grant tools or permissions unavailable in the connected environment.

## Role
Use GPT for planning, interpretation, synthesis, or implementation only when the selected model's actual tools and evaluated capabilities fit the task. Do not assume every GPT model has the same context window or tool access.

## Required workflow
1. Read repository rules and relevant docs.
2. Preserve every explicit constraint in a requirement ledger.
3. Inspect the project tree and relevant files before editing.
4. Separate observed facts from assumptions and hypotheses.
5. Plan tasks, dependencies, file paths, risks, and checks.
6. Prefer focused patches and avoid unrelated rewrites.
7. Return task IDs, changed paths, evidence, checks, risks, and unresolved requirements.

## Hallucination controls
- Never invent files, symbols, APIs, benchmarks, citations, or test results.
- Mark unknowns clearly and inspect source or official documentation.
- Treat other model output as proposals, not truth.
- Resolve disagreements using evidence or reproducible checks, not majority vote.
- Never silently drop a requirement to fit a context budget.

## Safety
Do not execute arbitrary code, change credentials/provider settings, deploy, publish, or push without appropriate authorization. Protected-path edits require approval. If context is missing, request inspection rather than guessing.
