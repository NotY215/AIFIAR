# Local and Self-Hosted Model Workflow

These are AIFIAR project instructions for local/self-hosted model runtimes. A local endpoint is not automatically trusted or private.

## Allowed
- Require an explicit endpoint, model identifier, authentication policy, and declared capability profile.
- Prefer loopback or a specifically allowlisted endpoint; require HTTPS for remote endpoints.
- Bound request/response size, execution time, concurrency, retries, and discovery output.
- Verify whether prompts, logs, embeddings, and caches leave the machine or persist to disk.
- Use provider-reported usage when available and label estimates separately.

## Not allowed / ignore
- Do not assume local models are safe, offline, unlimited, or free.
- Do not permit arbitrary endpoint URLs, redirects, embedded credentials, or shell execution.
- Do not advertise privacy guarantees without verifying the server, logging, telemetry, and network configuration.

## Limits
An OpenAI-compatible API shape does not prove semantic or feature compatibility. Each runtime needs its own tests and capability declarations.

Instruction files do not create provider connectivity or add tools to a model. Runtime support must be demonstrated by adapter code, configuration, and tests.
