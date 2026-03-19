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
WHISPER_MODEL_DIR="$WHISPER_DIR/models"
WHISPER_MODEL_FILENAME="ggml-${MODEL}.bin"
WHISPER_MODEL_PATH="$WHISPER_MODEL_DIR/$WHISPER_MODEL_FILENAME"
WHISPER_MODEL_CACHE_DIR="${MILADY_WHISPER_MODEL_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/milady/whisper}"
WHISPER_MODEL_CACHE_PATH="$WHISPER_MODEL_CACHE_DIR/$WHISPER_MODEL_FILENAME"

if [ ! -d "$WHISPER_DIR" ]; then
  echo "Error: whisper.cpp not found at $WHISPER_DIR" >&2
  echo "Run 'bun install' first." >&2
  exit 1
fi

echo "==> Building whisper.cpp in $WHISPER_DIR"
cd "$WHISPER_DIR"
make -j"$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

mkdir -p "$WHISPER_MODEL_DIR"
mkdir -p "$WHISPER_MODEL_CACHE_DIR"

if [ -f "$WHISPER_MODEL_PATH" ]; then
  echo "==> Whisper model already present: $WHISPER_MODEL_PATH"
elif [ -f "$WHISPER_MODEL_CACHE_PATH" ]; then
  echo "==> Restoring whisper model from cache: $WHISPER_MODEL_CACHE_PATH"
  cp "$WHISPER_MODEL_CACHE_PATH" "$WHISPER_MODEL_PATH"
else
  echo "==> Downloading model: $WHISPER_MODEL_FILENAME"
  bash models/download-ggml-model.sh "$MODEL"
fi

if [ -f "$WHISPER_MODEL_PATH" ]; then
  cp "$WHISPER_MODEL_PATH" "$WHISPER_MODEL_CACHE_PATH"
fi

echo "==> Done. Binary: $WHISPER_DIR/main"
echo "    Model:  $WHISPER_MODEL_PATH"
echo "    Cache:  $WHISPER_MODEL_CACHE_PATH"
