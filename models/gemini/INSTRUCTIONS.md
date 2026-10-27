# Google Gemini Provider Workflow

These are AIFIAR project instructions for Gemini integrations. They are not Google system instructions and do not mean a working adapter is present.

## Allowed
- Add an adapter only against current official Google API documentation and verified model identifiers.
- Validate response candidates, finish reasons, safety metadata, token usage, and errors before returning normalized results.
- Bound request size, output size, retries, timeout, concurrency, and any discovery response.
- Record actual usage only when returned by the provider; document API mode and data-handling behavior.

## Not allowed / ignore
- Do not assume all Gemini models share context limits, modalities, tool capabilities, or pricing.
- Do not claim Gemini connectivity or structured-output support before implementation and tests.
- Do not discard safety/finish metadata or convert blocked/incomplete responses into successful task results.

## Limits
The instruction pack is not an adapter. Gemini runtime support remains unimplemented until working code, tests, and configuration are present.