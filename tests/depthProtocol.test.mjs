import test from "node:test";
import assert from "node:assert/strict";
import { buildDepthProtocolInstructions } from "../dist/core/depthProtocol.js";

test("depth protocol includes prediction, analysis, reasoning, interpretation and verification passes", () => {
  const prompt = buildDepthProtocolInstructions("general");
  for (const section of [
    /PREDICTION AND FORECASTING/,
    /ANALYSIS:/,
    /REASONING AND THINKING/,
    /INTERPRETATION/,
    /FACT-CHECKING/,
    /INTERNET SURFING \/ BROWSING/,
    /DEPTH FIXING \/ SELF-AUDIT/,
    /COMPLETION AND CALIBRATION/
  ]) assert.match(prompt, section);
});

test("depth protocol avoids fabricated browsing and private chain-of-thought demands", () => {
  const prompt = buildDepthProtocolInstructions("research");
  assert.match(prompt, /If browsing is unavailable or not used/);
  assert.match(prompt, /Do not reveal hidden chain-of-thought/);
  assert.match(prompt, /Never fabricate citations/);
  assert.match(prompt, /Research emphasis/);
});

test("task-specific depth focuses implementation and review without claiming execution", () => {
  const coding = buildDepthProtocolInstructions("coding");
  const review = buildDepthProtocolInstructions("review");
  assert.match(coding, /acceptance criteria/);
  assert.match(coding, /inspect the final diff/);
  assert.match(review, /confirmed defect from a hypothesis/);
  assert.match(review, /evidence needed to reproduce/);
});

test("depth scales with impact rather than maximizing verbosity for every request", () => {
  const prompt = buildDepthProtocolInstructions("general");
  assert.match(prompt, /Depth means completeness, evidence, and error correction, not verbosity/);
  assert.match(prompt, /For simple stable questions/);
});
