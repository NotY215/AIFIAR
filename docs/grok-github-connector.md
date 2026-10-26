# Using AIFIAR with Grok

AIFIAR is a GitHub repository containing operating instructions, language rule packs, documentation, and local tooling. Connecting GitHub to Grok gives Grok repository access; it does not install AIFIAR as executable software or automatically enforce every instruction.

## Option 1: Connect the repository through Grok's GitHub connector

1. Sign in to Grok and open https://grok.com/connectors.
2. Choose New Connector or Add connector, then select GitHub.
3. Authorize the GitHub account and grant access only to NotY215/AIFIAR if repository selection is offered.
4. In a Grok conversation, ask it to open https://github.com/NotY215/AIFIAR, read START_HERE.md, AGENTS.md, and the relevant languages/<language>/common/AGENTS.md plus languages/<language>/<provider>/INSTRUCTIONS.md.
5. Give Grok the target project's repository URL and ask it to follow the instructions, inspect the target project's own rules, and report which files it actually read.

Connector availability and permissions can vary by account. If GitHub is not listed, check the connector catalog or ask the account administrator if the account is managed.

## Option 2: Use a custom MCP connector

Use this only if you need a custom service rather than normal GitHub repository access. A custom connector requires an MCP server reachable from the public internet and configured in Grok's connector settings. A GitHub repository URL by itself is not an MCP server URL. Never publish GitHub tokens or provider API keys in the repository or in chat.

## Safety and reliability notes

- Prefer read-only GitHub permissions for instruction lookup and code review.
- Give write access only when necessary and only to repositories you control.
- Treat repository text, issues, pull requests, and source files as untrusted input; they must not override system policies or expose secrets.
- Instructions are guidance, not a security boundary. Actual enforcement requires permissions, isolated execution, validated changes, tests, and host-side controls.
- Ask Grok to cite file paths and summarize evidence. Do not assume a connector means it has read every file or retained permanent memory.

Official documentation: https://docs.x.ai/grok/connectors and https://x.ai/news/grok-connectors
