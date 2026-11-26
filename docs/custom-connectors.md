# AIFIAR custom connector architecture
AIFIAR provides host profiles for Claude, ChatGPT, Grok, Codex, and Cursor. User setup lives in `Connectors/<Host>/`; executable shared implementation lives in `connectors/shared/`.

## Tools
- `aifiar_status`: connector status and configured provider names.
- `aifiar_list_models`: configuration-derived model metadata; no provider request.
- `aifiar_get_instructions`: fixed allowlist of instruction files.
- `aifiar_prepare_repository`: GitHub URL validation and intake checklist; no fetch.

## Security
MCP stdio JSON-RPC, bounded 1 MiB messages, closed tool schemas, validated inputs. No arbitrary paths, shell, process, network, patch, write, approval, or live inference tools. Instruction reads use a fixed allowlist, canonical path containment, regular-file validation, and a 64 KiB cap. Provider status never returns secret values.

Future write tools must use host identity, authorization, signed approval receipts, freshness checks, patch transactions, verification, and rollback. Do not add direct filesystem-write shortcuts.

| Host | Current integration |
|---|---|
| Claude | Local stdio for Claude Desktop; web requires remote hosting |
| ChatGPT | Profile only; web requires remote HTTPS MCP and supported authentication |
| Grok | Compatibility profile; native MCP client support unverified |
| Codex | Local stdio |
| Cursor | Local stdio |

Provider adapters call model APIs; MCP connectors let hosts call AIFIAR. xAI API integration does not establish Grok app MCP-client support.

Remote deployment needs HTTPS, reviewed Streamable HTTP, compatible authentication, authenticated principal mapping, per-user authorization, rate limiting, audit logging, request limits, monitoring, and security review. These host services are not shipped. Never expose stdio directly to the network. Run `npm test`; real-client validation remains required.

## Remote MCP deployment
See [Remote connector deployment](remote-connector-deployment.md) for the authenticated stateless Streamable HTTP service, token generation, per-principal scopes, Docker deployment, and host setup boundaries. This bearer-token transport is not an OAuth authorization server. OAuth-only client setup remains unsupported.
