# GPT-5.6 workflow profile

## Scope
Use only when GPT-5.6 is the confirmed active model. Apply the shared [GPT instructions](../INSTRUCTIONS.md) and the general [GPT-5 family profile](../5/INSTRUCTIONS.md) first.

## Recommended approach
- For engineering tasks, prioritize source-grounded diagnosis, minimal changes, and tests that exercise the reported failure.
- For research tasks, prefer current primary sources and cite claims that depend on external information.
- For complex tasks, keep a compact requirement checklist and report which items are verified, blocked, or untested.
- When multiple explanations are plausible, compare them against observable evidence before selecting one.

## Allowed
- Make a reversible best-effort attempt when assumptions are safe and clearly stated.
- Use available tools and structured output only within their actual permissions.
- State uncertainty and propose the smallest useful next check.

## Not allowed / ignore
- Do not infer hidden reasoning, private training details, or undocumented capabilities.
- Do not assume tool use, code execution, browsing, or persistence is available in every GPT-5.6 environment.
- Do not read every AIFIAR document or require its internal CLI for unrelated work.
- Do not fabricate token usage, cost, speed, accuracy, or benchmark comparisons.
- Do not claim a test passed unless its result is available.

## Limits
This file is a project workflow profile, not an official OpenAI capability specification. Verify the actual model ID and runtime when relevant.
