from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from .scanner import DEFAULT_IGNORES

SECRET_DIRS = {".ssh", ".aws", ".gnupg", ".aifiar", "credentials", "secrets"}
SECRET_FILES = {".env", "id_rsa", "id_ed25519", "credentials", "secrets.json"}
MAX_COPY_FILES = 100_000
MAX_COPY_FILE_BYTES = 10 * 1024 * 1024
MAX_COPY_TOTAL_BYTES = 1024 * 1024 * 1024


def _copy_workspace(source: Path, destination: Path) -> dict[str, Any]:
    files = 0
    total = 0
    skipped: list[str] = []
    for current, directories, names in os.walk(source, topdown=True, followlinks=False):
        current_path = Path(current)
        kept_dirs = []
        for name in directories:
            candidate = current_path / name
            relative = candidate.relative_to(source)
            if name in DEFAULT_IGNORES or name in SECRET_DIRS or candidate.is_symlink():
                skipped.append(relative.as_posix())
            else:
                kept_dirs.append(name)
        directories[:] = kept_dirs
        target_dir = destination / current_path.relative_to(source)
        target_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            candidate = current_path / name
            relative = candidate.relative_to(source)
            if candidate.is_symlink() or name in SECRET_FILES or name.startswith(".env"):
                skipped.append(relative.as_posix())
                continue
            try:
                info = candidate.stat(follow_symlinks=False)
                if not candidate.is_file() or info.st_size > MAX_COPY_FILE_BYTES:
                    skipped.append(relative.as_posix())
                    continue
                if files >= MAX_COPY_FILES or total + info.st_size > MAX_COPY_TOTAL_BYTES:
                    raise ValueError("Workspace copy limit reached; sandbox run refused.")
                before = hashlib.sha256(candidate.read_bytes()).hexdigest()
                target = destination / relative
                shutil.copyfile(candidate, target)
                after = hashlib.sha256(target.read_bytes()).hexdigest()
                latest = candidate.stat(follow_symlinks=False)
                if before != after or latest.st_mtime_ns != info.st_mtime_ns or latest.st_size != info.st_size:
                    raise ValueError("Source file changed while preparing sandbox: " + relative.as_posix())
                files += 1
                total += info.st_size
            except OSError as exc:
                raise ValueError("Could not safely copy workspace file: " + relative.as_posix()) from exc
    return {"files_copied": files, "bytes_copied": total, "skipped_paths": skipped}


def run_docker_sandbox(
    root: str | Path,
    image: str,
    command: list[str],
    *,
    timeout_seconds: int = 120,
    max_output_bytes: int = 1_000_000,
    memory_limit: str = "1g",
    cpu_limit: str = "2",
    pids_limit: int = 128,
) -> dict[str, Any]:
    """Run a command in a disposable Docker container using an isolated copy of the workspace."""
    source = Path(root).resolve(strict=True)
    if not source.is_dir() or not image.strip() or not command:
        raise ValueError("Workspace, image, and container command are required.")
    if not 1 <= timeout_seconds <= 900:
        raise ValueError("Sandbox timeout must be between 1 and 900 seconds.")
    if not 1024 <= max_output_bytes <= 10_000_000:
        raise ValueError("Output cap must be between 1 KiB and 10 MB.")
    if not 1 <= pids_limit <= 1024:
        raise ValueError("PID limit must be between 1 and 1024.")
    if any("\x00" in item for item in [image, *command]):
        raise ValueError("Arguments may not contain NUL characters.")
    docker = shutil.which("docker")
    if docker is None:
        return {"allowed": False, "reason": "Docker CLI was not found.", "exit_code": None}

    inspect = subprocess.run(
        [docker, "image", "inspect", image],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=15,
        check=False,
        shell=False,
    )
    if inspect.returncode != 0:
        return {"allowed": False, "reason": "Image is not available locally. Pull and review it separately before running.", "exit_code": None}

    with tempfile.TemporaryDirectory(prefix="aifiar-sandbox-") as temp:
        workspace = Path(temp) / "workspace"
        workspace.mkdir(mode=0o700)
        copy_report = _copy_workspace(source, workspace)
        docker_args = [
            docker, "run", "--rm",
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit", str(pids_limit),
            "--memory", memory_limit,
            "--cpus", cpu_limit,
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m",
            "--user", "65532:65532",
            "--mount", f"type=bind,src={workspace},dst=/workspace,rw",
            "--workdir", "/workspace",
            image,
            *command,
        ]
        start = time.monotonic()
        with tempfile.TemporaryFile() as output:
            try:
                process = subprocess.Popen(
                    docker_args,
                    stdin=subprocess.DEVNULL,
                    stdout=output,
                    stderr=subprocess.STDOUT,
                    shell=False,
                    env={key: value for key, value in os.environ.items() if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR"}},
                )
            except OSError as exc:
                return {"allowed": False, "reason": "Could not start Docker: " + type(exc).__name__, "exit_code": None}
            reason = None
            while process.poll() is None:
                output.seek(0, os.SEEK_END)
                if output.tell() > max_output_bytes:
                    reason = "output-limit"
                    process.kill()
                    break
                if time.monotonic() - start > timeout_seconds:
                    reason = "timeout"
                    process.kill()
                    break
                time.sleep(0.025)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            output.seek(0)
            captured = output.read(max_output_bytes).decode("utf-8", errors="replace")
            output.seek(0, os.SEEK_END)
            output_limited = output.tell() > max_output_bytes
        return {
            "allowed": True,
            "exit_code": process.returncode,
            "reason": reason,
            "timed_out": reason == "timeout",
            "output_limited": reason == "output-limit" or output_limited,
            "duration_seconds": round(time.monotonic() - start, 3),
            "output": captured,
            "workspace": copy_report,
            "security_controls": [
                "network disabled",
                "read-only container root",
                "all Linux capabilities dropped",
                "no-new-privileges",
                "bounded PIDs, memory, CPU, timeout, and captured output",
                "disposable workspace copy without symlinks or common secret paths",
            ],
            "limitations": [
                "Container isolation is defense in depth, not a perfect security boundary.",
                "The image must be reviewed and already present locally. No automatic image pull occurs.",
                "Docker daemon security and host kernel vulnerabilities remain host responsibilities.",
                "The container receives a writable temporary copy, not the original workspace.",
            ],
        }
