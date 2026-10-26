#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language python --root "${1:-.}" --execute
