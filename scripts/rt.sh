#!/bin/sh
# Runtime-agnostic script runner - switched to pnpm/node
# Dispatch based on file extension
case "$1" in
  *.ts|*.js|*.mjs|*/*.ts|*/*.js|*/*.mjs)
    # Executing a script file
    exec node --import tsx "$@"
    ;;
  *)
    # Executing a package manager command (install, run, etc)
    exec pnpm "$@"
    ;;
esac
