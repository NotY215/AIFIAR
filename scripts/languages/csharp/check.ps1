param([string]$Root = ".")
$ErrorActionPreference = "Stop"
python scripts/language_checks.py --language csharp --root $Root --execute
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
