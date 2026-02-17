#!/bin/sh
# Runtime-agnostic script runner - use bun for TypeScript
# Dispatch based on file extension
case "$1" in
  *.ts|*.js|*.mjs|*/*.ts|*/*.js|*/*.mjs)
    # Executing a script file - use bun for native TS support
    exec bun "$@"
    ;;
  *)
    # Executing a package manager command (install, run, etc)
    exec bun "$@"
    ;;
esac
