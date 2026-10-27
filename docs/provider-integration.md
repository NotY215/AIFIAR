# Provider integration

AIFIAR has guarded text-only HTTP adapters for OpenAI Chat Completions, OpenAI Responses, xAI's OpenAI-compatible Chat Completions endpoint, Anthropic's native Messages API, and Qwen's OpenAI-compatible Chat Completions API. These adapters send bounded task descriptions, receive text, and return normalized TaskResult values. They do not grant filesystem access or execute model-proposed commands.

## Supported adapter factories

The implementation lives in models/openaiCompatibleAdapter.ts:
- createOpenAIExecutor(apiKey, modelId, options?) uses https://api.openai.com/v1.
- createXAIExecutor(apiKey, modelId, options?) uses https://api.x.ai/v1.
- Qwen and Qwen Code use createOpenAICompatibleExecutor with the host-configured Model Studio-compatible base URL.
- createOpenAICompatibleExecutor(config) supports compatible endpoints. Remote endpoints must use HTTPS. HTTP is permitted only for localhost endpoints.
- createAnthropicExecutor(config) uses `https://api.anthropic.com/v1/messages`, `x-api-key`, and the `anthropic-version` header. It aggregates text blocks and records provider-reported usage; it does not enable Anthropic tools.

The adapter uses native fetch, no added runtime dependency, no shell, no provider-side tools, and no automatic URL redirects. Credentials are passed in the authorization header and are never included in returned errors. Never hard-code keys in source or commit them.

## Guardrails

- API keys are supplied by the host, preferably from environment variables or a secret manager.
- The adapter rejects insecure remote URLs and URLs containing embedded credentials, query parameters, or fragments.
- Request timeouts, bounded retries, a maximum 2 MiB task input, a maximum 2 MiB response body, and a maximum of three attempts are enforced.
- HTTP 401/403 are not retried. Rate limits, server errors, timeouts, and network failures may be retried within the configured attempt limit.
- Potential secrets are redacted from serialized task context before sending and from returned model text before reporting.
- Provider output is untrusted text. It is not interpreted as a patch, command, permission, or verified fact.
- Provider token usage is recorded only when the response reports valid usage counts.
- The adapter intentionally does not enable tools, browse, edit files, or claim that tests were run.
- Redaction uses heuristic patterns and cannot guarantee that every secret format will be found. Review outbound context and provider data-handling terms.

## Current limitations

- The shared OpenAI-compatible adapter targets text-only Chat Completions-compatible APIs. OpenAI Responses is implemented separately in `models/openAIResponsesAdapter.ts`. The current adapters do not provide multimodal input, streaming, provider tool calls, OAuth, or provider-side tools. Model discovery is a separate bounded helper for OpenAI and xAI; it does not select models automatically.
- Gemini and generic local/self-hosted providers still have workflow guidance only, not executable adapters. Anthropic has a native Messages API adapter but no model discovery, streaming, multimodal input, provider tools, or OAuth. Qwen is text-only, uses a host-configured compatible endpoint and region-matched key, and does not enable built-in search tools or web browsing. See `models/provider-coverage.json` for current coverage.
- Routing benchmark reports, model outcome comparison, verified-rate-card cost estimates, and the opt-in private in-memory result cache are documented in [evaluation and cache](evaluation-and-cache.md). These helpers do not prove live benchmark results or billing accuracy.
- Provider APIs and model availability can change. Confirm current official documentation and account access before use.
- Integration tests use mocked HTTP responses. They do not call paid provider APIs by default.
- The core orchestrator selects a model from the registry but does not itself create a repository profile, construct full source context, or enforce a complete end-to-end approval workflow. The host must perform those steps and validate outputs before applying changes.
## Environment-driven runtime

models/providerRuntime.ts wires the provider factories into a StaticModelRegistry and a dispatching TaskExecutor. Set OPENAI_API_KEY together with AIFIAR_OPENAI_MODEL to configure OpenAI, XAI_API_KEY together with AIFIAR_XAI_MODEL to configure xAI, ANTHROPIC_API_KEY together with AIFIAR_ANTHROPIC_MODEL to configure Claude through Anthropic, and DASHSCOPE_API_KEY plus AIFIAR_QWEN_BASE_URL and the desired Qwen model ID to configure Qwen. A provider missing required configuration is marked unconfigured and will not be selected by the normal task router. The general Qwen profile uses AIFIAR_QWEN_MODEL; Qwen Code uses AIFIAR_QWEN_CODE_MODEL. Both share DASHSCOPE_API_KEY and AIFIAR_QWEN_BASE_URL, but each requires its own model ID.

Example for a local shell session:

```bash
export OPENAI_API_KEY='your-key-from-a-secret-manager'
export AIFIAR_OPENAI_MODEL='your-enabled-model-id'
npm run test
```

To use the runtime, call createProviderRuntime() and pass its registry and executor to runPlan(). Supply a validated WorkPlan from your host. Tests inject a fake fetch implementation and never require live credentials. Do not print environment variables or paste credentials into logs.

## Responses API

The separate `models/openAIResponsesAdapter.ts` implements text-only requests to OpenAI's Responses API. It supports bounded input/output, redaction, timeout and retry limits, output extraction from either `output_text` or structured output items, usage reporting, and rate-limit telemetry. Set `AIFIAR_OPENAI_API_MODE=responses` to select it in the runtime. The model ID is read from `AIFIAR_OPENAI_RESPONSES_MODEL`, falling back to `AIFIAR_OPENAI_MODEL`. This mode applies only to OpenAI.

## Model discovery

The runtime exposes `discoverModels("openai")`, `discoverModels("xai")`, `discoverModels("qwen")`, and `discoverModels("qwen-code")`. Discovery requires a configured provider key, uses the official provider base URL, rejects insecure remote URLs and redirects, enforces a timeout and response-size cap, and returns model IDs plus available rate-limit headers. Discovery does not automatically change the selected model. Check account access and compatibility before changing configuration.

## Telemetry

`models/providerTelemetry.ts` provides a bounded in-memory event buffer and aggregate counts for outcomes, latency, and provider-reported tokens. Adapters emit available rate-limit headers and retry-after hints. This telemetry is not durable billing data and does not estimate cost unless pricing metadata is added by the host. Never persist API keys or raw prompts in telemetry.

## Opt-in live tests

Set `AIFIAR_LIVE_TESTS=1` and the relevant environment variables, then run `npm run test:live`. Chat Completions tests use `OPENAI_API_KEY` + `AIFIAR_OPENAI_MODEL` or `XAI_API_KEY` + `AIFIAR_XAI_MODEL`. The Responses test uses `OPENAI_API_KEY` + `AIFIAR_OPENAI_RESPONSES_MODEL`. Tests request a short text response with a low output-token cap. Default CI never requires credentials and skips live calls.


## Repository-aware task input

The provider adapters include the optional `Task.context` and `Task.contextRefs` fields in the bounded, redacted task payload. Use `runRepositoryWorkflow` from `core/repositoryWorkflow.ts` to refresh repository memory, assemble task-specific context, and dispatch the enriched plan through the existing orchestrator. Context references contain relative paths and source hashes so a host can recheck freshness before accepting any proposed change.

This workflow provides source-aware analysis, not automatic patch application. Model output remains untrusted and must pass the existing permission gate, patch validation, digest approval, freshness checks, safe transaction, and verification pipeline before edits are applied.
