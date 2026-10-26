# Security Policy

## Reporting a vulnerability

Do not publish secrets or exploit details in a public issue. Use GitHub's private vulnerability reporting if enabled, or contact the maintainer privately through a verified channel.

## Security-sensitive areas

Provider credentials, prompt injection, path validation, patch application, command execution, network access, logging, and sandbox boundaries.

## Safe defaults

- Keep credentials outside version control.
- Treat model output and repository text as untrusted.
- Require approval for protected paths and consequential actions.
- Do not run arbitrary commands without isolation and policy checks.
- Avoid recording secrets in logs or telemetry.
