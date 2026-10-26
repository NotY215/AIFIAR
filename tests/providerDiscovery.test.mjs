import test from "node:test";
import assert from "node:assert/strict";
import { discoverModels } from "../dist/models/providerDiscovery.js";

test("discovers model IDs and safe rate-limit metadata", async () => {
  const result = await discoverModels({
    provider: "openai", apiKey: "test-key", baseUrl: "https://api.example/v1",
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://api.example/v1/models");
      assert.equal(init.redirect, "error");
      return new Response(JSON.stringify({ data: [{ id: "z-model", owned_by: "team" }, { id: "a-model", created: 123 }] }), {
        status: 200, headers: { "x-ratelimit-remaining-requests": "12" }
      });
    }
  });
  assert.deepEqual(result.models.map((m) => m.id), ["a-model", "z-model"]);
  assert.equal(result.rateLimit?.remaining, 12);
});

test("model discovery rejects insecure remote URLs and oversized lists", async () => {
  await assert.rejects(discoverModels({ provider: "x", apiKey: "k", baseUrl: "http://api.example/v1" }), /HTTPS/);
  await assert.rejects(discoverModels({
    provider: "x", apiKey: "k", baseUrl: "https://api.example/v1",
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
  }), /schema/);
});
