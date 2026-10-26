#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language ruby --root "${1:-.}" --execute
