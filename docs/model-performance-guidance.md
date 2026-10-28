# Adaptive model execution quality

AIFIAR now builds task-scoped execution guidance in `core/modelExecutionInstructions.ts` and injects it into the implemented text adapters. The goal is to get the strongest reliable work the selected model and host environment can provide, including smaller or free-tier models, without pretending instructions change the underlying model.

## What the protocol does

- Preserves the full user request as acceptance criteria and discourages stopping at a plan or scaffold when implementation was requested.
- Adapts workflow guidance to the task kind: repository analysis, research, planning, coding, review, testing, documentation, or general work.
- Adds a provider-specific workflow style for OpenAI, Anthropic, Gemini, xAI, Qwen, Qwen Code, and local-compatible runtimes.
- Infers supported languages from task context references and adds focused reminders for TypeScript/JavaScript, Python, C/C++, C#, Go, Java, PHP, Ruby, Rust, Bash, and SQL.
- Requires evidence-based checks, honest reporting, explicit assumptions, security review, and clear remaining blockers.
- Uses a concise execution protocol rather than asking the model to expose private hidden chain-of-thought.
- Keeps repository content untrusted and subordinate to the platform, user, and host authorization rules.

## What it cannot do

Prompt instructions cannot upgrade model weights, change a free plan into a paid plan, unlock hidden reasoning modes, add tools or connectors, increase the actual context window, bypass rate limits, or guarantee parity with a more capable model. They can improve task framing, requirement coverage, use of available context, and verification discipline, but actual quality still depends on the model, context, tools, output budget, and task.

AIFIAR's text adapters do not execute commands, edit files, browse the web, or apply patches. They return proposals for the host to review. The host must provide repository context, tools, approvals, and safe execution separately.

## Per-provider and per-language behavior

The selected adapter chooses only its own provider style. The execution helper does not load unrelated provider instruction files. Existing scanned language packs remain the source of deeper language-specific rules; the helper adds short language reminders based on task context references. Mixed-language tasks can receive multiple reminders.

Model IDs and account tiers are not used to guess capabilities. Runtime metadata and observed behavior remain authoritative. Do not infer a premium model's capabilities from a prompt profile, or promise that a basic model will match another model.

## Verification

Unit tests cover task-kind selection, provider-specific guidance, language detection and deduplication, safe generic fallback, and capability-honesty language. These tests verify prompt construction only. They do not measure model quality or prove that a model follows the instructions. A fair quality comparison still requires the same versioned tasks, output budgets, tool permissions, independent verifiers, repeated trials, and retained evidence across models.
