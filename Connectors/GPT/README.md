# AIFIAR for ChatGPT

AIFIAR now has a remote stateless MCP endpoint suitable for ChatGPT custom MCP connectors when the connector setup supports OAuth.

1. Deploy the remote service using [the deployment guide](../../docs/remote-connector-deployment.md).
2. Configure an external OAuth/OIDC identity provider with ChatGPT's exact redirect URI and the AIFIAR audience.
3. Configure the access token claims: `scope` includes `aifiar:read`, `aifiar_profile` is `gpt`, and `aifiar_tools` is the explicit allowed tool array.
4. Register the deployed HTTPS endpoint `https://YOUR-HOST/mcp` as the MCP server.
5. Complete the OAuth connection in the ChatGPT connector setup and verify the available tools.

The protected-resource metadata endpoint is `https://YOUR-HOST/.well-known/oauth-protected-resource/mcp`. AIFIAR validates the external provider's RS256 access tokens through the configured JWKS URL. AIFIAR does not host the identity provider or manage user login/consent.

Static bearer/API-key mode is available only if the selected ChatGPT connector setup UI offers that authentication method. Do not bypass an OAuth requirement by enabling unauthenticated access. The remote tool profile is read-only and exposes only explicitly granted tools.
