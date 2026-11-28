# AIFIAR remote MCP connector deployment

AIFIAR exposes a stateless MCP Streamable HTTP endpoint at `/mcp`. It supports two authentication modes:
- Static high-entropy bearer tokens for clients that offer API-key/bearer authentication.
- Externally issued OAuth/OIDC JWT access tokens for OAuth-capable clients.

AIFIAR is an OAuth **resource server**, not an authorization server. Login, consent, client registration, authorization-code/PKCE, refresh-token rotation, and user lifecycle belong to the configured external identity provider. AIFIAR validates the resulting access token and applies the identity's AIFIAR profile and tool scopes.

## Build and run locally

1. Install Node.js 20 or newer.
2. Run `npm install` and `npm run build`.
3. Choose one authentication mode:
   - Static token: generate a token with `node scripts/generate-connector-token.mjs --profile=gpt --subject=your-user-id` and store the JSON output in `AIFIAR_REMOTE_TOKENS`.
   - OAuth/OIDC: configure `AIFIAR_OIDC_ISSUER`, `AIFIAR_OIDC_AUDIENCE`, and `AIFIAR_OIDC_JWKS_URL` as described below. Static tokens may be omitted.
4. Set `AIFIAR_REMOTE_PUBLIC_URL=https://your-domain.example/mcp`, `AIFIAR_REMOTE_PATH=/mcp`, and `AIFIAR_REMOTE_ALLOWED_HOSTS=your-domain.example`. Optionally set `AIFIAR_REMOTE_ALLOWED_ORIGINS`.
5. Run `npm run connector:remote`. The process binds to loopback by default. For a container deployment, bind to `0.0.0.0` behind a TLS-terminating reverse proxy.

The public URL must be HTTPS and its path must match the configured endpoint path. Only exact configured host[:port] values are accepted; wildcard hosts are rejected. Browser origins are denied unless explicitly listed as exact HTTPS origins without paths or credentials. Server-to-server clients may omit Origin.

## Docker deployment

Copy `deploy/remote-mcp.env.example` to an untracked `deploy/remote-mcp.env`, configure the public URL and one authentication mode, then run from the `deploy` directory:

```sh
docker compose -f docker-compose.remote.yml up --build -d
```

Place a reverse proxy or managed HTTPS ingress in front of the internal container network. The Compose service is not published directly to the internet. Do not forward client-supplied identity headers as authentication.

## OAuth/OIDC identity provider

Set these three values together:
- `AIFIAR_OIDC_ISSUER`: exact HTTPS issuer identifier.
- `AIFIAR_OIDC_AUDIENCE`: the API audience registered for AIFIAR.
- `AIFIAR_OIDC_JWKS_URL`: HTTPS JSON Web Key Set URL.

AIFIAR publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`. The MCP client can discover the external authorization server from this metadata. Configure that identity provider with the host's exact redirect URI and authorization-code flow with PKCE S256. Configure token claim mapping to issue:
- `iss`, `aud`, `sub`, `exp`, and `scope` containing `aifiar:read`.
- `aifiar_profile`: one of `claude`, `gpt`, `grok`, `codex`, or `cursor`.
- `aifiar_tools`: an explicit array containing only allowed tools: `aifiar_status`, `aifiar_list_models`, `aifiar_get_instructions`, and/or `aifiar_prepare_repository`.
- Optional `aifiar_requests_per_minute`: integer from 1 to 600.

The verifier accepts RS256-signed JWT access tokens and checks signature, exact issuer, audience, expiry, optional not-before, subject, required scope, profile, tool claims, and per-principal rate limits. It rejects unsupported JOSE header features, non-signing keys, duplicate key IDs, and RSA keys below 2048 bits. JWKS retrieval is HTTPS-only, limited to 1 MiB and 100 keys, cached for 10 seconds to one hour, bounded by a request timeout, and refreshed once when a token references a previously unseen key ID. The external identity provider should issue short-lived access tokens and use secure refresh-token rotation. AIFIAR does not store passwords, issue tokens, or manage login sessions.

## Static bearer-token configuration

`AIFIAR_REMOTE_TOKENS` is a JSON array. Each record contains:
- `token`: at least 32 characters of random secret.
- `subject`: stable non-secret principal identifier.
- `profile`: `claude`, `gpt`, `grok`, `codex`, or `cursor`.
- `tools`: explicit tool allowlist.
- `requestsPerMinute`: optional limit from 1 to 600.

Tokens are SHA-256 digested at startup and compared using constant-time digest comparison. They are never returned by tools or written to logs. Rotate by replacing the token record and restarting the service. Use one token per user or workload. The in-memory rate limiter resets on restart; use an API gateway/WAF for distributed limits.

## Host setup

- **ChatGPT custom MCP connector:** use the HTTPS MCP URL. Select OAuth when available; the host discovers protected-resource metadata and follows the configured external authorization server. If the host setup only offers OAuth, configure OIDC rather than choosing no authentication. Static bearer mode works only if the current host UI offers API-key authentication.
- **Claude remote MCP connector:** use the HTTPS URL with the configured OAuth/OIDC provider, or bearer authentication if the selected Claude client supports custom authorization headers.
- **Codex and Cursor:** local stdio profiles remain available; remote MCP is optional.
- **Grok:** remains compatibility-unverified until the exact Grok client/version is confirmed to support MCP and its authentication mode.

## MCP transport and security boundaries

The service uses stateless Streamable HTTP: authenticated JSON-RPC POST requests, JSON responses, HTTP 202 for notifications, no session IDs, and no SSE GET stream. Clients must send `Accept: application/json, text/event-stream` and `Content-Type: application/json`. It supports MCP protocol version `2025-06-18`. Clients that require resumable sessions or SSE GET need a future transport implementation.

The remote endpoint exposes only the existing read-only tools. It does not add repository writes, shell execution, arbitrary filesystem access, or live model inference. Container defaults include a non-root user, read-only root filesystem, dropped capabilities, no-new-privileges, and CPU/memory/PID limits.

Operators must provision DNS/TLS, identity-provider configuration, token distribution, ingress, external rate limiting, monitoring, secret rotation, backup/restore, and independent security review. This is a deployable connector service, not a turnkey public hosted SaaS.
