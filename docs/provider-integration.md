# Provider integration

AIFIAR now has an executable adapter for providers exposing the OpenAI Chat Completions-compatible API shape, with convenience factories for OpenAI and xAI. This is a real HTTP adapter, not a tool-enabled coding agent. It sends a bounded task description, receives text, and returns a normalized TaskResult. It does not grant filesystem access or execute model-proposed commands.

## Supported adapter factories

The implementation lives in models/openaiCompatibleAdapter.ts:
- createOpenAIExecutor(apiKey, modelId, options?) uses https://api.openai.com/v1.
- createXAIExecutor(apiKey, modelId, options?) uses https://api.x.ai/v1.
- createOpenAICompatibleExecutor(config) supports compatible endpoints. Remote endpoints must use HTTPS. HTTP is permitted only for localhost endpoints.

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

- The adapter targets Chat Completions-compatible APIs. It does not implement the Responses API, xAI-specific features, multimodal input, streaming, provider tool calls, OAuth, automatic model discovery, or provider-side structured-output modes.
- Provider APIs and model availability can change. Confirm current official documentation and account access before use.
- Integration tests use mocked HTTP responses. They do not call paid provider APIs by default.
- The core orchestrator selects a model from the registry but does not itself create a repository profile, construct full source context, or enforce a complete end-to-end approval workflow. The host must perform those steps and validate outputs before applying changes.
## Environment-driven runtime

models/providerRuntime.ts wires the provider factories into a StaticModelRegistry and a dispatching TaskExecutor. Set OPENAI_API_KEY together with AIFIAR_OPENAI_MODEL to configure OpenAI, and set XAI_API_KEY together with AIFIAR_XAI_MODEL to configure xAI. A provider missing either value is marked unconfigured and will not be selected by the normal task router.

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

The runtime exposes `discoverModels("openai")` and `discoverModels("xai")`. Discovery requires a configured provider key, uses the official provider base URL, rejects insecure remote URLs and redirects, enforces a timeout and response-size cap, and returns model IDs plus available rate-limit headers. Discovery does not automatically change the selected model. Check account access and compatibility before changing configuration.

## Telemetry

`models/providerTelemetry.ts` provides a bounded in-memory event buffer and aggregate counts for outcomes, latency, and provider-reported tokens. Adapters emit available rate-limit headers and retry-after hints. This telemetry is not durable billing data and does not estimate cost unless pricing metadata is added by the host. Never persist API keys or raw prompts in telemetry.

## Opt-in live tests

Set `AIFIAR_LIVE_TESTS=1` and the relevant environment variables, then run `npm run test:live`. Chat Completions tests use `OPENAI_API_KEY` + `AIFIAR_OPENAI_MODEL` or `XAI_API_KEY` + `AIFIAR_XAI_MODEL`. The Responses test uses `OPENAI_API_KEY` + `AIFIAR_OPENAI_RESPONSES_MODEL`. Tests request a short text response with a low output-token cap. Default CI never requires credentials and skips live calls.
