# Language check wrappers

These wrappers are convenience entry points for the shared `scripts/language_checks.py` detector. Run them from the AIFIAR checkout and pass the target repository as the optional first argument.

Examples:

```sh
sh scripts/languages/cpp/check.sh /path/to/trusted-cpp-project
sh scripts/languages/python/check.sh /path/to/trusted-python-project
sh scripts/languages/rust/check.sh /path/to/trusted-rust-project
```

On Windows PowerShell:

```powershell
.\scripts\languages\cpp\check.ps1 -Root C:\work\trusted-cpp-project
.\scripts\languages\csharp\check.ps1 -Root C:\work\trusted-dotnet-project
```

The wrappers explicitly enable execution. The helper uses argument arrays and timeouts, but build systems and test runners execute project-defined code. Use these only for trusted workspaces, review the detected commands first, and use a real sandbox for untrusted repositories. SQL is intentionally excluded from generic wrappers because database commands require an explicit disposable test database and connection policy.
