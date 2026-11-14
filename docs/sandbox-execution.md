# Host sandbox execution contract

AIFIAR's model adapters are text-only and never execute provider-generated commands. Some hosts need to run builds, tests, or static analyzers after a proposal has passed approval. Such execution must happen through a separately managed isolated runtime.

## Contract

`core/sandboxExecution.ts` provides `runSandboxedCommand`, a fail-closed wrapper around a host-supplied `SandboxRuntime`. Before delegating, it requires the host adapter to attest:

- Container or virtual-machine isolation.
- Workspace-only filesystem access.
- Network disabled.
- No host credentials exposed to the process.
- Shell invocation disabled.
- CPU, memory, process-count, and wall-clock resource limits enforced by the runtime.

The wrapper also requires an exact executable allowlist, argument arrays, workspace-relative working directories, bounded environment variables, bounded execution time, and bounded combined stdout/stderr. It rejects shell interpreter executables and credential-like environment variable names. It does not spawn processes itself.

## Host responsibilities

The attestation is a contract supplied by the host, not cryptographic proof. The host must implement and independently test the actual sandbox. A compliant implementation should:

1. Create a fresh disposable container or VM for each untrusted execution job.
2. Mount only the selected workspace, with explicit read/write policy; keep secrets and host home directories unmounted.
3. Disable network by default and use explicit, narrow egress policy only where required.
4. Drop privileges, capabilities, inherited handles, ambient credentials, and unnecessary environment variables.
5. Enforce memory, CPU, process-count, disk, and wall-clock quotas outside the child process.
6. Pin and verify the image/toolchain, capture exit status, and destroy the environment after completion.
7. Treat stdout, stderr, generated files, and exit codes as untrusted evidence that must be checked by the verification pipeline.

Do not implement the runtime by invoking a shell on the host, trusting a Docker command string, or passing model-generated command text to `exec`. The host must construct argument arrays from trusted workflow configuration and use its own sandbox API.

## Status

The shared wrapper and deterministic contract tests are implemented. AIFIAR does not ship a container/VM daemon, Windows Job Object backend, Linux namespace/seccomp backend, macOS sandbox backend, or an independently verified isolation runtime. Production execution isolation remains incomplete until a host supplies and tests one of those implementations. The wrapper's attestation cannot make an insecure host runner safe.
