#!/usr/bin/env python3
"""Detect conventional language checks; execution requires explicit opt-in."""
from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

LANGUAGES = ("cpp","c","python","javascript","typescript","csharp","java","rust","go","php","ruby","bash","sql")

# Only pass ordinary toolchain/runtime configuration to check subprocesses.
# Provider tokens, cloud credentials, package registry secrets, and arbitrary
# parent-process variables are intentionally not inherited.
SAFE_ENV_KEYS = {
    "PATH", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR", "SYSTEMROOT",
    "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE",
    "JAVA_HOME", "DOTNET_ROOT", "GOROOT", "GOPATH", "CARGO_HOME",
    "RUSTUP_HOME", "VIRTUAL_ENV", "PYTHONPATH", "PHP_INI_SCAN_DIR",
    "GEM_HOME", "GEM_PATH", "BUNDLE_GEMFILE", "ANDROID_HOME",
    "ANDROID_SDK_ROOT", "CI"
}

def safe_check_environment(parent_env: dict[str, str]) -> dict[str, str]:
    """Return a minimal environment for explicitly requested local checks."""
    return {key: value for key, value in parent_env.items() if key.upper() in SAFE_ENV_KEYS}

def detect(language: str, root: Path) -> list[tuple[str, tuple[str, ...]]]:
    which = shutil.which
    if language in {"cpp","c"}:
        if (root/"CMakeLists.txt").is_file() and which("cmake"):
            result=[("CMake configure",("cmake","-S",".","-B","build")),("CMake build",("cmake","--build","build"))]
            if which("ctest"): result.append(("CTest",("ctest","--test-dir","build","--output-on-failure")))
            return result
        if (root/"Makefile").is_file() and which("make"): return [("Make tests",("make","test"))]
        return []
    if language=="python":
        if which("pytest") and any((root/p).exists() for p in ("pytest.ini","pyproject.toml","setup.cfg","tests")): return [("pytest",("python","-m","pytest"))]
        if (root/"tests").is_dir() and which("python"): return [("unittest",("python","-m","unittest","discover","-s","tests","-v"))]
        return []
    if language in {"javascript","typescript"}:
        try: scripts=json.loads((root/"package.json").read_text(encoding="utf-8")).get("scripts",{})
        except (OSError,ValueError): return []
        out=[]
        if which("npm") and "test" in scripts: out.append(("npm test",("npm","test")))
        if language=="typescript" and which("npm") and "typecheck" in scripts: out.append(("typecheck",("npm","run","typecheck")))
        return out
    if language=="csharp": return [("dotnet test",("dotnet","test"))] if which("dotnet") and (list(root.glob("*.sln")) or list(root.glob("*.csproj"))) else []
    if language=="java":
        if (root/"mvnw").is_file() and (root/"pom.xml").is_file() and which("sh"): return [("Maven wrapper",("sh","./mvnw","test"))]
        if (root/"gradlew").is_file() and any((root/p).exists() for p in ("build.gradle","build.gradle.kts")) and which("sh"): return [("Gradle wrapper",("sh","./gradlew","test"))]
        if (root/"pom.xml").is_file() and which("mvn"): return [("Maven",("mvn","test"))]
        if any((root/p).exists() for p in ("build.gradle","build.gradle.kts")) and which("gradle"): return [("Gradle",("gradle","test"))]
        return []
    if language=="rust": return [("Cargo tests",("cargo","test","--workspace","--all-targets"))] if which("cargo") and (root/"Cargo.toml").is_file() else []
    if language=="go": return [("Go tests",("go","test","./...")),("Go vet",("go","vet","./..."))] if which("go") and (root/"go.mod").is_file() else []
    if language=="php":
        try: scripts=json.loads((root/"composer.json").read_text(encoding="utf-8")).get("scripts",{})
        except (OSError,ValueError): return []
        return [("Composer tests",("composer","test"))] if which("composer") and "test" in scripts else []
    if language=="ruby":
        if not which("bundle") or not (root/"Gemfile").is_file(): return []
        if (root/".rspec").exists(): return [("RSpec",("bundle","exec","rspec"))]
        if (root/"Rakefile").exists(): return [("Rake tests",("bundle","exec","rake","test"))]
        return []
    if language=="bash":
        files=sorted(str(p.relative_to(root)) for p in root.glob("*.sh") if p.is_file())
        return [("ShellCheck",("shellcheck",*files))] if files and which("shellcheck") else []
    return []

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language",choices=LANGUAGES,required=True)
    parser.add_argument("--root",type=Path,default=Path.cwd())
    parser.add_argument("--execute",action="store_true",help="execute detected project checks")
    parser.add_argument("--timeout",type=int,default=600)
    args=parser.parse_args()
    if not 1<=args.timeout<=3600: parser.error("--timeout must be between 1 and 3600 seconds")
    root=args.root.resolve()
    if not root.is_dir(): parser.error("root must be an existing directory")
    checks=detect(args.language,root)
    if not checks:
        print("No supported configured checks detected. No command was executed.")
        return 0
    for name,cmd in checks: print(("RUN " if args.execute else "DETECTED ")+name+": "+" ".join(cmd))
    if not args.execute:
        print("Dry run only. Review project scripts before using --execute in a trusted checkout.")
        return 0
    for name,cmd in checks:
        print("\n== "+name+" ==")
        try: result=subprocess.run(cmd,cwd=root,shell=False,timeout=args.timeout,check=False,env={**safe_check_environment(dict(os.environ)), "CI":"1"})
        except subprocess.TimeoutExpired:
            print(name+" timed out after "+str(args.timeout)+" seconds",file=sys.stderr); return 124
        if result.returncode:
            print(name+" failed with exit code "+str(result.returncode),file=sys.stderr); return result.returncode
    return 0

if __name__=="__main__": raise SystemExit(main())
