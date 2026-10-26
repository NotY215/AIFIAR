#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language javascript --root "${1:-.}" --execute
