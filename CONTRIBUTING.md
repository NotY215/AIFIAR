# Contributing to AIFIAR

1. Read `AGENTS.md` and relevant documents in `docs/`.
2. Open an issue or describe intended architectural changes before large refactors.
3. Keep modules focused and prefer small diffs.
4. Add or update tests for behavior changes.
5. Run `npm run typecheck` and `npm run build` where possible.
6. Document provider-specific assumptions and use current official documentation.
7. Never commit API keys, tokens, credentials, private data, or untrusted executable payloads.
8. Report checks actually run and what remains unverified.

Provider integrations should be optional, use secure configuration, and fail with actionable errors when unavailable.
