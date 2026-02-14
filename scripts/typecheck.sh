#!/usr/bin/env sh

if command -v tsgo >/dev/null 2>&1; then
  exec tsgo
fi

if command -v tsc >/dev/null 2>&1; then
  exec tsc --noEmit
fi

exec bunx tsc --noEmit
