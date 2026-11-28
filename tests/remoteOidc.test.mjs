import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createOidcVerifier, loadOidcConfig } from "../dist/connectors/remote/oidc.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pair2 = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "unit-key", use: "sig", alg: "RS256" };
const cfg = { issuer: "https://issuer.example", audience: "aifiar-api", jwksUrl: new URL("https://issuer.example/jwks"), cacheMs: 30000 };
const claims = { iss: cfg.issuer, aud: cfg.audience, sub: "test-user", exp: 1700000600, scope: "aifiar:read", aifiar_profile: "gpt", aifiar_tools: ["aifiar_status"] };
const makeToken = (value, keyPair = pair, kid = "unit-key") => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid });
  const payload = encode(value);
  const input = header + "." + payload;
  return input + "." + sign("RSA-SHA256", Buffer.from(input), keyPair.privateKey).toString("base64url");
};
const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });

test("OIDC config requires complete HTTPS issuer, audience and JWKS", () => {
  assert.equal(loadOidcConfig({}), null);
  assert.throws(() => loadOidcConfig({ AIFIAR_OIDC_ISSUER: cfg.issuer }));
  assert.throws(() => loadOidcConfig({ AIFIAR_OIDC_ISSUER: "http://issuer.example", AIFIAR_OIDC_AUDIENCE: cfg.audience, AIFIAR_OIDC_JWKS_URL: cfg.jwksUrl.href }));
  assert.throws(() => loadOidcConfig({ AIFIAR_OIDC_ISSUER: cfg.issuer, AIFIAR_OIDC_AUDIENCE: " ", AIFIAR_OIDC_JWKS_URL: cfg.jwksUrl.href }));
});

test("OIDC access tokens require valid RS256 signature, issuer, audience, expiry and AIFIAR scopes", async () => {
  const verify = createOidcVerifier(cfg, fetcher, () => 1700000000000);
  const principal = await verify("Bearer " + makeToken(claims));
  assert.equal(principal.subject, "test-user");
  assert.deepEqual(principal.tools, ["aifiar_status"]);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, iss: "https://wrong.example" })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, aud: "wrong" })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, exp: 1699999999 })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, scope: "openid" })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, aifiar_tools: ["shell"] })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, nbf: "not-a-number" })), null);
  assert.equal(await verify("Bearer " + makeToken({ ...claims, aifiar_tools: ["aifiar_status", "aifiar_status"] })), null);
});

test("OIDC verifier caches JWKS and rejects empty or unsuitable key sets", async () => {
  let calls = 0;
  const verify = createOidcVerifier(cfg, async () => { calls++; return fetcher(); }, () => 1700000000000);
  await verify("Bearer " + makeToken(claims));
  await verify("Bearer " + makeToken(claims));
  assert.equal(calls, 1);

  const empty = createOidcVerifier(cfg, async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }), () => 1700000000000);
  assert.equal(await empty("Bearer " + makeToken(claims)), null);

  const encryptionOnly = createOidcVerifier(cfg, async () => new Response(JSON.stringify({ keys: [{ ...jwk, use: "enc" }] }), { status: 200 }), () => 1700000000000);
  assert.equal(await encryptionOnly("Bearer " + makeToken(claims)), null);
});

test("OIDC verifier refreshes JWKS once when a rotated key ID is not cached", async () => {
  let calls = 0;
  const rotatedJwk = { ...pair2.publicKey.export({ format: "jwk" }), kid: "rotated-key", use: "sig", alg: "RS256" };
  const verify = createOidcVerifier(cfg, async () => {
    calls++;
    return new Response(JSON.stringify({ keys: calls === 1 ? [jwk] : [jwk, rotatedJwk] }), { status: 200 });
  }, () => 1700000000000);
  const principal = await verify("Bearer " + makeToken(claims, pair2, "rotated-key"));
  assert.equal(principal?.subject, "test-user");
  assert.equal(calls, 2);
});
