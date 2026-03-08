#!/usr/bin/env bash
# Build whisper.cpp binary and download the base.en model.
# Run once after `bun install`, and again after upgrading whisper-node.
#
# Usage:
#   bash apps/app/electrobun/scripts/build-whisper.sh [model]
#
# model: tiny.en | base.en (default) | small.en | medium.en | large-v3
#
set -euo pipefail

MODEL="${1:-base.en}"
WHISPER_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)/node_modules/whisper-node/lib/whisper.cpp"

if [ ! -d "$WHISPER_DIR" ]; then
  echo "Error: whisper.cpp not found at $WHISPER_DIR" >&2
  echo "Run 'bun install' first." >&2
  exit 1
fi

echo "==> Building whisper.cpp in $WHISPER_DIR"
cd "$WHISPER_DIR"
make -j"$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

echo "==> Downloading model: ggml-${MODEL}.bin"
bash models/download-ggml-model.sh "$MODEL"

echo "==> Done. Binary: $WHISPER_DIR/main"
echo "    Model:  $WHISPER_DIR/models/ggml-${MODEL}.bin"
