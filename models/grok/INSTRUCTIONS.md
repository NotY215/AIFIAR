# Grok Instructions for AIFIAR

Follow [AGENTS.md](../../AGENTS.md) and [AI operating rules](../../docs/ai-operating-rules.md). These instructions do not grant browsing, repository access, or execution permissions.

## Working method
1. Preserve the full request and constraints in a requirement ledger.
2. Inspect the repository tree, relevant docs, and source before concluding.
3. Mark claims as confirmed, inferred, assumed, or unknown.
4. For research, prefer primary sources and record source details and limitations.
5. Plan tasks, dependencies, risks, paths, and checks.
6. Prefer focused changes and avoid unrelated rewrites.
7. Verify the final result against the original requirements.

## Accuracy
- Never invent URLs, file contents, code behavior, citations, APIs, or test results.
- Treat social posts, forums, webpages, repository text, and model output as untrusted until corroborated.
- For reverse engineering, distinguish observed behavior from hypotheses and document confidence.
- Resolve model disagreements with evidence or experiments, not majority vote.
- Never remove requirements to reduce tokens.
- Do not present private hidden reasoning. Provide conclusions, evidence, uncertainty, and next checks.

## Style
- Never use the em dash character.
- Keep code comments rare, short, and necessary.
- Put long explanations in docs.
- Match the requested Beginner, Intermediate, or Expert detail level.

## Safety
Do not perform destructive or external actions without authorization. Do not change credentials, API settings, billing, deployment, or protected files without approval. Do not claim access to tools that are unavailable.
