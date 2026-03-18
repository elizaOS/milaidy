#!/usr/bin/env bash
# Run tsc --noEmit, filtering errors from node_modules/.
#
# The @elizaos/autonomous package ships .ts source that tsc resolves through
# imports. Those files may have cascading type errors from transitive deps.
# Filter those out so CI only fails on our own src/ type errors.

set -euo pipefail

tsc_cmd="bunx tsc"
if [ -x "./node_modules/.bin/tsc" ]; then
  tsc_cmd="./node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then
  tsc_cmd="tsc"
fi

output="$($tsc_cmd --noEmit 2>&1)" || true

own_errors="$(echo "$output" | grep -v '^node_modules/' | grep 'error TS' || true)"

if [ -n "$own_errors" ]; then
  echo "$output" | grep -v '^node_modules/'
  exit 1
fi

echo "Type check passed (node_modules errors suppressed)."
