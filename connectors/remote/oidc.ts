import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { RemotePrincipal } from "./auth.js";

export interface OidcConfig {
  issuer: string;
  audience: string;
  jwksUrl: URL;
  cacheMs: number;
}

interface Jwk {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
  key_ops?: string[];
  n?: string;
  e?: string;
}

const TOOLS = ["aifiar_status", "aifiar_list_models", "aifiar_get_instructions", "aifiar_prepare_repository"];
const PROFILES = ["claude", "gpt", "grok", "codex", "cursor"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function loadOidcConfig(env = process.env): OidcConfig | null {
  const issuer = env.AIFIAR_OIDC_ISSUER;
  const audience = env.AIFIAR_OIDC_AUDIENCE;
  const jwks = env.AIFIAR_OIDC_JWKS_URL;
  if (!issuer && !audience && !jwks) return null;
  if (!issuer || !audience || !jwks) {
    throw new Error("OIDC requires issuer, audience, and JWKS URL together.");
  }

  let issuerUrl: URL;
  let jwksUrl: URL;
  try {
    issuerUrl = new URL(issuer);
    jwksUrl = new URL(jwks);
  } catch {
    throw new Error("OIDC issuer and JWKS URL must be absolute URLs.");
  }

  if (
    issuerUrl.protocol !== "https:" ||
    jwksUrl.protocol !== "https:" ||
    issuerUrl.username ||
    issuerUrl.password ||
    jwksUrl.username ||
    jwksUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    jwksUrl.hash
  ) {
    throw new Error("OIDC issuer and JWKS URL must use HTTPS without credentials or fragments.");
  }
  if (!audience.trim() || audience.length > 512) {
    throw new Error("OIDC audience must be a non-empty value of at most 512 characters.");
  }

  const cacheMs = Number(env.AIFIAR_OIDC_JWKS_CACHE_MS ?? 300000);
  if (!Number.isInteger(cacheMs) || cacheMs < 10000 || cacheMs > 3600000) {
    throw new Error("OIDC JWKS cache must be 10 seconds to one hour.");
  }

  return { issuer: issuerUrl.href, audience, jwksUrl, cacheMs };
}

export function createOidcVerifier(
  config: OidcConfig,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now
) {
  let cached: { expires: number; keys: Jwk[] } | undefined;
  let pending: Promise<Jwk[]> | undefined;

  async function fetchKeys(): Promise<Jwk[]> {
    const response = await fetcher(config.jwksUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("JWKS fetch failed.");
    const body = await response.text();
    if (body.length > 1048576) throw new Error("JWKS response too large.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JWKS JSON.");
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.keys) || parsed.keys.length < 1 || parsed.keys.length > 100) {
      throw new Error("JWKS must contain 1 to 100 keys.");
    }

    const keys = parsed.keys.filter((key): key is Jwk =>
      isRecord(key) &&
      key.kty === "RSA" &&
      (key.use === undefined || key.use === "sig") &&
      (key.alg === undefined || key.alg === "RS256") &&
      (key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.includes("verify"))) &&
      typeof key.kid === "string" &&
      key.kid.length > 0 &&
      key.kid.length <= 256 &&
      typeof key.n === "string" &&
      typeof key.e === "string"
    );

    if (!keys.length) throw new Error("No supported RSA signing keys.");
    const ids = keys.map(key => key.kid);
    if (new Set(ids).size !== ids.length) throw new Error("JWKS contains duplicate signing key IDs.");
    return keys;
  }

  async function getKeys(forceRefresh = false): Promise<Jwk[]> {
    if (!forceRefresh && cached && cached.expires > now()) return cached.keys;
    if (!pending) {
      pending = fetchKeys()
        .then(keys => {
          cached = { keys, expires: now() + config.cacheMs };
          return keys;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  }

  return async (authorization: string | undefined): Promise<RemotePrincipal | null> => {
    if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) return null;
    const token = authorization.slice(7);
    if (token.length > 16384) return null;

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) return null;

    let header: unknown;
    let claims: unknown;
    try {
      header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
      claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    } catch {
      return null;
    }

    if (!isRecord(header) || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;
    if (header.crit !== undefined || header.zip !== undefined || header.jku !== undefined || header.x5u !== undefined) return null;
    if (!isRecord(claims)) return null;

    const audiences = typeof claims.aud === "string"
      ? [claims.aud]
      : Array.isArray(claims.aud) && claims.aud.every(value => typeof value === "string")
        ? claims.aud as string[]
        : [];
    const nowSeconds = Math.floor(now() / 1000);

    if (
      claims.iss !== config.issuer ||
      !audiences.includes(config.audience) ||
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= nowSeconds ||
      claims.exp > nowSeconds + 86400 ||
      (claims.nbf !== undefined && (
        typeof claims.nbf !== "number" ||
        !Number.isSafeInteger(claims.nbf) ||
        claims.nbf > nowSeconds + 30
      )) ||
      typeof claims.sub !== "string" ||
      !/^[A-Za-z0-9._:@-]{1,128}$/.test(claims.sub)
    ) return null;

    const scopes = typeof claims.scope === "string"
      ? claims.scope.split(/\s+/).filter(Boolean)
      : Array.isArray(claims.scp) && claims.scp.every(value => typeof value === "string")
        ? claims.scp as string[]
        : [];

    if (
      !scopes.includes("aifiar:read") ||
      typeof claims.aifiar_profile !== "string" ||
      !PROFILES.includes(claims.aifiar_profile) ||
      !Array.isArray(claims.aifiar_tools) ||
      claims.aifiar_tools.length === 0 ||
      !claims.aifiar_tools.every((tool: unknown) => typeof tool === "string" && TOOLS.includes(tool)) ||
      new Set(claims.aifiar_tools).size !== claims.aifiar_tools.length
    ) return null;

    const requestsPerMinute = claims.aifiar_requests_per_minute ?? 60;
    if (!Number.isInteger(requestsPerMinute) || Number(requestsPerMinute) < 1 || Number(requestsPerMinute) > 600) {
      return null;
    }

    try {
      let keys = await getKeys();
      let jwk = keys.find(key => key.kid === header.kid);
      if (!jwk) {
        keys = await getKeys(true);
        jwk = keys.find(key => key.kid === header.kid);
      }
      if (!jwk) return null;

      const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
      if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return null;

      const signingInput = Buffer.from(parts[0] + "." + parts[1], "ascii");
      const signature = Buffer.from(parts[2]!, "base64url");
      if (!verifySignature("RSA-SHA256", signingInput, key, signature)) return null;

      return {
        subject: claims.sub,
        profile: claims.aifiar_profile as RemotePrincipal["profile"],
        tools: claims.aifiar_tools as string[],
        requestsPerMinute: Number(requestsPerMinute)
      };
    } catch {
      return null;
    }
  };
}
