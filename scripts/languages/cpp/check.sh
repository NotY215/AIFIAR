#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language cpp --root "${1:-.}" --execute
