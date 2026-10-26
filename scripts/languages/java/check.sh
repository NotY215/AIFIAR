#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language java --root "${1:-.}" --execute
