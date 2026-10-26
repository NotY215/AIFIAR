from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


def load_policy(path: str | Path) -> dict[str, Any]:
    policy_path = Path(path).resolve(strict=True)
    if policy_path.stat().st_size > 256 * 1024:
        raise ValueError("Command policy file exceeds size limit.")
    data = json.loads(policy_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("commands"), list):
        raise ValueError("Command policy must contain a commands array.")
    return data


def run_allowlisted(root: str | Path, policy: dict[str, Any], argv: list[str]) -> dict[str, Any]:
    """Run only a configured argv prefix without a shell; this is not an OS sandbox."""
    base = Path(root).resolve(strict=True)
    if not base.is_dir() or not argv or any("\x00" in item for item in argv):
        raise ValueError("Invalid working root or command arguments.")
    executable = shutil.which(argv[0])
    if executable is None:
        return {"allowed": False, "reason": "Executable was not found.", "exit_code": None}
    resolved_exe = str(Path(executable).resolve(strict=True))
    basename = Path(resolved_exe).name.lower()
    args = argv[1:]
    selected = None
    for rule in policy["commands"]:
        if not isinstance(rule, dict):
            continue
        configured = str(rule.get("executable", ""))
        configured_path = shutil.which(configured)
        configured_resolved = str(Path(configured_path).resolve()) if configured_path else configured
        prefix = rule.get("args_prefix", [])
        if configured_resolved == resolved_exe and isinstance(prefix, list) and args[:len(prefix)] == prefix:
            if rule.get("allow_extra_args", False) is not True and args != prefix:
                continue
            selected = rule
            break
    if selected is None:
        return {"allowed": False, "reason": "Command and argument prefix are not allowlisted.", "executable": basename, "exit_code": None}

    timeout = selected.get("timeout_seconds", 30)
    output_limit = selected.get("max_output_bytes", 1_000_000)
    if not isinstance(timeout, (int, float)) or not 1 <= timeout <= 300:
        raise ValueError("Policy timeout must be between 1 and 300 seconds.")
    if not isinstance(output_limit, int) or not 1024 <= output_limit <= 10_000_000:
        raise ValueError("Policy output limit must be between 1 KiB and 10 MB.")

    env = {
        key: value for key, value in os.environ.items()
        if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE"}
    }
    env["PYTHONNOUSERSITE"] = "1"
    start = time.monotonic()
    with tempfile.TemporaryFile() as output:
        kwargs: dict[str, Any] = {
            "cwd": str(base),
            "env": env,
            "stdin": subprocess.DEVNULL,
            "stdout": output,
            "stderr": subprocess.STDOUT,
            "shell": False,
        }
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            kwargs["start_new_session"] = True
        process = subprocess.Popen([resolved_exe, *args], **kwargs)
        reason = None
        while process.poll() is None:
            elapsed = time.monotonic() - start
            output.seek(0, os.SEEK_END)
            if output.tell() > output_limit:
                reason = "output-limit"
                _terminate_process(process)
                break
            if elapsed > timeout:
                reason = "timeout"
                _terminate_process(process)
                break
            time.sleep(0.025)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        output.seek(0)
        captured = output.read(output_limit).decode("utf-8", errors="replace")
        output.seek(0, os.SEEK_END)
        truncated = output.tell() > output_limit
    return {
        "allowed": True,
        "executable": basename,
        "exit_code": process.returncode,
        "reason": reason,
        "timed_out": reason == "timeout",
        "output_limited": reason == "output-limit" or truncated,
        "duration_seconds": round(time.monotonic() - start, 3),
        "output": captured,
        "note": "The command ran without a shell but was not isolated by an OS or container sandbox.",
    }

def _terminate_process(process: subprocess.Popen[Any]) -> None:
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
                shell=False,
            )
        else:
            import signal
            os.killpg(process.pid, signal.SIGKILL)
    except (OSError, subprocess.TimeoutExpired):
        try:
            process.kill()
        except OSError:
            pass
