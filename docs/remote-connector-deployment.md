# AIFIAR remote MCP connector deployment

This adds a stateless MCP Streamable HTTP endpoint at `/mcp`, with bearer-token or external OAuth/OIDC JWT authentication, per-principal tool scopes, rate limits, host/origin checks, bounded request bodies, a health endpoint, and a container deployment. Authentication supports either static bearer tokens or externally issued OAuth/OIDC JWT access tokens. AIFIAR acts as an OAuth resource server, not an authorization server: login, consent, client registration, authorization-code/PKCE, refresh tokens, and user lifecycle remain with the external identity provider.

## Build and run locally
1. Install Node.js 20 or newer.
2. Run `npm install` and `npm run build`.
3. Generate a high-entropy token: `node scripts/generate-connector-token.mjs --profile=gpt --subject=your-user-id`.
4. Put the generated JSON array into `AIFIAR_REMOTE_TOKENS` in a secret manager or untracked environment file. Never commit it.
5. Set `AIFIAR_REMOTE_PUBLIC_URL=https://your-domain.example/mcp`, `AIFIAR_REMOTE_PATH=/mcp`, `AIFIAR_REMOTE_ALLOWED_HOSTS=your-domain.example`, and optionally `AIFIAR_REMOTE_ALLOWED_ORIGINS`. For external OAuth/OIDC, also set `AIFIAR_OIDC_ISSUER`, `AIFIAR_OIDC_AUDIENCE`, and `AIFIAR_OIDC_JWKS_URL`. For external OAuth/OIDC, also set `AIFIAR_OIDC_ISSUER`, `AIFIAR_OIDC_AUDIENCE`, and `AIFIAR_OIDC_JWKS_URL`.
6. Run `npm run connector:remote`. The process binds to loopback by default. For container deployment set `AIFIAR_REMOTE_HOST=0.0.0.0` behind a TLS-terminating reverse proxy.

The public URL must be HTTPS and its path must match the configured endpoint path. Only the configured host is accepted. Browser origins are denied unless explicitly listed. Server-to-server clients may omit Origin.

## Docker deployment
Copy `deploy/remote-mcp.env.example` to an untracked `deploy/remote-mcp.env`, set the public URL and token array, then run from the deploy directory:

```sh
docker compose -f docker-compose.remote.yml up --build -d
```

Place a reverse proxy or managed HTTPS ingress in front of the internal container network. The compose service is not published directly to the internet. Configure proxy request-size and timeout limits to match the service. Do not forward client-supplied identity headers as authentication.

## Host setup
- ChatGPT custom MCP connector: configure the HTTPS MCP URL and OAuth when available. The client discovers protected-resource metadata and follows the configured external authorization server. Configure the identity provider with the host's exact redirect URI and AIFIAR token claims. Static bearer mode is available only where the host UI supports API-key authentication.
- Claude remote MCP connector: configure the HTTPS URL and OAuth/OIDC provider, or use a bearer token if the selected Claude client supports custom authorization headers.
- Codex and Cursor can continue using local stdio profiles; remote MCP is optional.
- Grok remains compatibility-unverified until the exact Grok client/version is confirmed to support MCP and bearer authentication.

## External OAuth/OIDC resource-server configuration
Set `AIFIAR_OIDC_ISSUER` (exact HTTPS issuer), `AIFIAR_OIDC_AUDIENCE` (AIFIAR API audience), and `AIFIAR_OIDC_JWKS_URL` (HTTPS JSON Web Key Set URL) together. The service publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and validates RS256 JWT signatures, issuer, audience, expiry, optional not-before, subject, the `aifiar:read` scope, `aifiar_profile`, and `aifiar_tools`. Optional `aifiar_requests_per_minute` limits a principal to 1–600 requests per minute. JWKS responses are HTTPS-only, bounded to 1 MiB and 100 keys, cached for 10 seconds to one hour, and fetched with a timeout. Configure your identity provider's claim mappers so each user receives only approved AIFIAR tools. The external authorization server should use authorization code with PKCE S256, exact redirect URIs, short-lived access tokens, and secure refresh-token rotation. AIFIAR is a resource server and does not implement login, consent, or the authorization server.

## External OAuth/OIDC resource-server configuration
Set `AIFIAR_OIDC_ISSUER` (exact HTTPS issuer), `AIFIAR_OIDC_AUDIENCE` (AIFIAR API audience), and `AIFIAR_OIDC_JWKS_URL` (HTTPS JSON Web Key Set URL) together. The service publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and validates RS256 JWT signatures, issuer, audience, expiry, optional not-before, subject, the `aifiar:read` scope, `aifiar_profile`, and `aifiar_tools`. Optional `aifiar_requests_per_minute` limits a principal to 1–600 requests per minute. JWKS responses are HTTPS-only, bounded to 1 MiB and 100 keys, cached for 10 seconds to one hour, and fetched with a timeout. Configure claim mappers so each identity receives only approved AIFIAR tools. The external authorization server should use authorization code with PKCE S256, exact redirect URIs, short-lived access tokens, and secure refresh-token rotation. AIFIAR does not implement the authorization server.

## Token configuration
`AIFIAR_REMOTE_TOKENS` is a JSON array. Each record has:
- `token`: at least 32 characters of random secret.
- `subject`: stable, non-secret principal identifier.
- `profile`: `claude`, `gpt`, `grok`, `codex`, or `cursor`.
- `tools`: explicit allowlist. A token can only call tools in this list.
- `requestsPerMinute`: optional per-principal limit (1–600).

Tokens are SHA-256 digested at startup and compared using constant-time digest comparison. They are never returned by tools or written to logs. Rotate by replacing the token record and restarting the service; old tokens stop working after restart. Use one token per user/host and least-privilege tool scopes. The current in-memory rate limiter is per process and resets on restart; use an API gateway/WAF for distributed rate limits and abuse protection.

## MCP transport behavior
Stateless Streamable HTTP: authenticated JSON-RPC POST requests, JSON responses, notifications return HTTP 202, no session IDs, and no SSE GET stream. Clients must send `Accept: application/json, text/event-stream` and `Content-Type: application/json`. The server supports protocol version `2025-06-18`. Sessionful clients requiring GET/SSE or resumability need a future transport implementation.

## Security and operations
- Use TLS at ingress, strict host allowlists, and explicit CORS origins.
- Keep tokens in a secret manager; do not store them in a tracked .env file.
- Use one identity/token per human or workload; never share a broad service token.
- Restrict tools to read-only scopes. The remote endpoint does not add repository write, shell, arbitrary filesystem, or live model-inference tools.
- Container defaults: non-root user, read-only root filesystem, no added capabilities, no-new-privileges, PID/memory/CPU limits, internal-only network.
- Add an external rate-limiting gateway, monitoring, log retention policy, secret rotation automation, backup/restore, and independent security review before production.
- Health checks disclose only `{status:"ok"}`; request logs contain request IDs, reason codes, and status, not authorization headers or request bodies.

This is a deployable bearer-token MCP service, not a turnkey public hosted SaaS. The operator must provision DNS/TLS, identity/token distribution, ingress, and host-specific connector registration. OAuth-only client onboarding remains a separate release gate.