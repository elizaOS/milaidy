#!/usr/bin/env sh

if command -v tsgo >/dev/null 2>&1; then
  exec tsgo
fi

if [ -x "./node_modules/.bin/tsc" ]; then
  exec ./node_modules/.bin/tsc --noEmit
fi

if command -v tsc >/dev/null 2>&1; then
  exec tsc --noEmit
fi

exec bunx tsc --noEmit
