#!/bin/sh
export NODE_PATH="/app/lib/node_modules"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export MILADY_DATA_DIR="${XDG_CONFIG_HOME}/milady"
exec /app/bin/node /app/lib/node_modules/miladyai/milady.mjs "$@"
