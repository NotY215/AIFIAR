# Branch governance

AIFIAR's requested day-to-day workflow is main-first: make changes on main, validate them, and commit them there. Do not create feature branches for routine work unless the repository owner explicitly asks for them or a platform integration requires one.

## Protect main

GitHub repository rules are server-side settings; committing a JSON file does not activate them. An administrator must import or recreate the configuration in .github/rulesets/main-protection.json.

1. Open the repository on GitHub and go to Settings → Rules → Rulesets.
2. Create a branch ruleset targeting main, and configure deletion and force-push restrictions.
3. Require pull-request reviews and the actual CI status-check names reported by this repository. The template proposes CI / test; verify that exact context exists before requiring it.
4. Enable required code-owner review only if a valid CODEOWNERS file and appropriate reviewers exist. Keep bypass actors empty unless there is a deliberate, documented reason to add one.
5. Save the ruleset as Active, then verify it in repository rules and test that a prohibited update is rejected.

## Important trade-off

A rule requiring pull requests and approvals conflicts with a workflow where the same person directly commits every change to main. If direct commits are a hard requirement, use a main-targeted ruleset that blocks deletion and force-pushes but does not require pull requests. For stronger production governance, prefer reviewed pull requests and merge them into main.

## Branch cleanup

Before deleting a branch, compare its commits with main, identify unique commits and open pull requests, and preserve useful work on main. Delete only after verifying it is merged or intentionally disposable. Never delete main. Dependabot branches may be recreated automatically.

Branch deletion is destructive. This document does not delete branches by itself; cleanup must be performed with repository-admin permissions after comparing branch history.

## Truthful release status

A repository cannot be called production-complete just because its documentation and instruction packs are extensive. Production readiness also requires reproducible CI, tested supported platforms, security review, real isolation boundaries, authenticated authorization, dependency maintenance, recovery testing, and operational documentation. Track unimplemented controls as release blockers rather than claiming they are solved.
