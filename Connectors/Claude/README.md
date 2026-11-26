# AIFIAR for Claude

Two connection modes are available:

- **Claude Desktop local:** merge `mcp-config.json` into Claude Desktop's `claude_desktop_config.json`, replace the example absolute path, rebuild AIFIAR, and restart Claude Desktop.
- **Remote MCP:** deploy the remote service using [the deployment guide](../../docs/remote-connector-deployment.md), configure an external OAuth/OIDC provider with the selected Claude client's exact redirect URI, then register the HTTPS endpoint `https://YOUR-HOST/mcp`.

For remote OAuth, the identity provider must issue RS256 JWT access tokens with `aifiar:read`, `aifiar_profile=claude`, and an explicit `aifiar_tools` array. The protected-resource metadata endpoint is `https://YOUR-HOST/.well-known/oauth-protected-resource/mcp`. Static bearer authentication is an alternative only when the selected Claude client supports custom bearer headers.

AIFIAR does not host the OAuth authorization server. The connector is read-only and does not bypass Claude's workspace or tool permissions.
