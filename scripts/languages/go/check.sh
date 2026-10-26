#!/usr/bin/env sh
set -eu
exec python3 scripts/language_checks.py --language go --root "${1:-.}" --execute
