#!/usr/bin/env bash
#
# fix-node-modules-for-electron-builder.sh
#
# Converts symlinked node_modules (from bun workspace) to actual directories.
# This is necessary because electron-builder's node_modules traversal doesn't
# properly follow bun's symlink structure when resolving transitive dependencies.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_MODULES_DIR="$ELECTRON_DIR/node_modules"

echo "[fix-node-modules] Converting symlinks to real directories in $NODE_MODULES_DIR"

if [ ! -d "$NODE_MODULES_DIR" ]; then
  echo "[fix-node-modules] Error: node_modules directory not found"
  exit 1
fi

# Find all symlinks in node_modules (not recursively following symlinks initially)
find "$NODE_MODULES_DIR" -maxdepth 2 -type l | while read -r link; do
  target=$(readlink "$link")

  # Resolve the actual target path
  if [[ "$target" == /* ]]; then
    actual_target="$target"
  else
    actual_target="$(dirname "$link")/$target"
  fi

  if [ -d "$actual_target" ]; then
    echo "[fix-node-modules] Converting: $(basename "$link")"
    rm "$link"
    cp -R "$actual_target" "$link"
  else
    echo "[fix-node-modules] Warning: Target not found for $link -> $target"
  fi
done

echo "[fix-node-modules] Done. Node modules are now real directories."
