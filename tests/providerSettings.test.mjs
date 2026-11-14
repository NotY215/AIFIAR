import test from "node:test";
import assert from "node:assert/strict";
import { resolveProviderExecutionSettings } from "../dist/models/providerSettings.js";

test("provider settings use safe defaults and provider-specific overrides", () => {
  assert.deepEqual(resolveProviderExecutionSettings({}, "openai"), {
    timeoutMs: 45_000,
    maxOutputTokens: 2_048,
    maxInputBytes: 128 * 1024,
    maxAttempts: 2
  });
  assert.deepEqual(resolveProviderExecutionSettings({
    AIFIAR_OPENAI_TIMEOUT_MS: "60000",
    AIFIAR_OPENAI_MAX_OUTPUT_TOKENS: "4096",
    AIFIAR_OPENAI_MAX_INPUT_BYTES: "262144",
    AIFIAR_OPENAI_MAX_ATTEMPTS: "3"
  }, "openai"), {
    timeoutMs: 60_000,
    maxOutputTokens: 4_096,
    maxInputBytes: 262_144,
    maxAttempts: 3
  });
});

test("Qwen Code settings override Qwen family defaults independently", () => {
  const settings = resolveProviderExecutionSettings({
    AIFIAR_QWEN_TIMEOUT_MS: "90000",
    AIFIAR_QWEN_MAX_OUTPUT_TOKENS: "4096",
    AIFIAR_QWEN_CODE_MAX_OUTPUT_TOKENS: "8192",
    AIFIAR_DEFAULT_MAX_ATTEMPTS: "1"
  }, "qwen-code");
  assert.equal(settings.timeoutMs, 90_000);
  assert.equal(settings.maxOutputTokens, 8_192);
  assert.equal(settings.maxAttempts, 1);
});

test("invalid provider limits fail closed", () => {
  assert.throws(() => resolveProviderExecutionSettings({ AIFIAR_GEMINI_TIMEOUT_MS: "0" }, "gemini"), /between 1000 and 180000/);
  assert.throws(() => resolveProviderExecutionSettings({ AIFIAR_ANTHROPIC_MAX_ATTEMPTS: "many" }, "anthropic"), /must be an integer/);
  assert.throws(() => resolveProviderExecutionSettings({ AIFIAR_LOCAL_MAX_INPUT_BYTES: "99999999" }, "local"), /between 1024 and 2097152/);
});
