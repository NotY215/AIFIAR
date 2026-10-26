# Security Policy

## Reporting a vulnerability

Do not publish secrets or exploit details in a public issue. Use GitHub's private vulnerability reporting if enabled, or contact the maintainer privately through a verified channel.

## Security-sensitive areas

Provider credentials, prompt injection, path validation, patch application, command execution, network access, logging, snapshot integrity, and sandbox boundaries.

## Safe defaults

- Keep credentials outside version control.
- Treat model output, retrieved repository text, and tool output as untrusted.
- Require host authorization for protected paths and consequential actions.
- Do not run arbitrary commands without isolation and policy checks.
- Avoid recording secrets in logs or telemetry.
- Run the language check helper in dry-run mode first. The `--execute` option executes project-defined build/test commands and must only be used in a trusted checkout.
- The portable Node recovery adapter is intended for trusted local workspaces. It is not a security boundary against hostile local processes or all filesystem race conditions.
- Language-specific instructions are guidance, not enforceable authorization.

## Production deployment

Review [the production readiness checklist](docs/production-readiness.md) before deploying. Passing CI does not establish production security. Native race-resistant filesystem operations, authenticated host approval integration, and production-grade isolation remain release blockers until implemented and independently validated.
