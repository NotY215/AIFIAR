# AIFIAR Custom Connectors
Host catalog: `Claude/`, `GPT/`, `Grok/`, `Codex/`, and `Cursor/`. Shared executable code is under lowercase `connectors/shared/`.

Read-only MCP tools: `aifiar_status`, `aifiar_list_models`, `aifiar_get_instructions`, and `aifiar_prepare_repository`. No arbitrary file access, shell, process execution, network fetch, patch, write, or live model call is exposed.

Requires Node.js 20+. Run `npm install`, `npm run build`, then `npm run connector:claude`, `connector:gpt`, `connector:grok`, `connector:codex`, or `connector:cursor`. MCP stdio reserves stdout for JSON-RPC.

Claude Desktop, Codex CLI, and Cursor use local stdio profiles. ChatGPT web requires remote HTTPS hosting and host-approved authentication. Grok is compatibility-unverified until native client support is confirmed. Never expose stdio directly to the internet.

## Remote hosting
Remote MCP deployment and external OAuth/OIDC setup are documented in [Remote connector deployment](../docs/remote-connector-deployment.md). ChatGPT and remote Claude profiles can use OAuth/OIDC access tokens; static bearer tokens are available for compatible clients. AIFIAR is a resource server, not an identity provider.