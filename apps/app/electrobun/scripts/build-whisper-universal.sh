#!/usr/bin/env bash
#
# build-whisper-universal.sh
#
# Builds whisper.cpp's `main` binary as a macOS universal binary (arm64 + x86_64).
# This ensures whisper-based features (swabble wake-word, talkmode) work on both
# Apple Silicon and Intel Macs.
#
# Usage: bash apps/app/electrobun/scripts/build-whisper-universal.sh [model]
#
# model: tiny.en | base.en (default) | small.en | medium.en | large-v3
#
set -euo pipefail

MODEL="${1:-base.en}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHISPER_CPP_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)/node_modules/whisper-node/lib/whisper.cpp"

if [ ! -d "$WHISPER_CPP_DIR" ]; then
  echo "[whisper-universal] whisper.cpp directory not found at $WHISPER_CPP_DIR"
  echo "[whisper-universal] Run 'bun install' first."
  exit 1
fi

cd "$WHISPER_CPP_DIR"
NCPU=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo "[whisper-universal] Building whisper.cpp universal binary (arm64 + x86_64)..."
echo "[whisper-universal] Directory: $WHISPER_CPP_DIR"
echo ""

# --- arm64 build (native on Apple Silicon, or cross-compile on Intel) ---
echo "[whisper-universal] === Building arm64 ==="
make clean 2>/dev/null || true
make main -j"$NCPU" 2>&1
cp main main_arm64
echo "[whisper-universal] arm64 build OK: $(file main_arm64)"
echo ""

# --- x86_64 build (via Rosetta on Apple Silicon, or native on Intel) ---
# Disable Metal for x86_64 since older Intel Macs may lack GPU support.
echo "[whisper-universal] === Building x86_64 ==="
make clean 2>/dev/null || true
arch -x86_64 make main -j"$NCPU" WHISPER_NO_METAL=1 2>&1
cp main main_x86_64
echo "[whisper-universal] x86_64 build OK: $(file main_x86_64)"
echo ""

# --- Combine into universal (fat) binary ---
echo "[whisper-universal] === Creating universal binary with lipo ==="
lipo -create main_arm64 main_x86_64 -output main
rm -f main_arm64 main_x86_64

echo "[whisper-universal] Result: $(file main)"
lipo -detailed_info main
echo ""

# --- Download model if not already present ---
echo "[whisper-universal] === Downloading model: ggml-${MODEL}.bin ==="
bash models/download-ggml-model.sh "$MODEL"

# --- Verify both slices execute ---
echo "[whisper-universal] === Verifying arm64 execution ==="
./main -h >/dev/null 2>&1 && echo "[whisper-universal] arm64 OK" || echo "[whisper-universal] arm64 FAILED"

echo "[whisper-universal] === Verifying x86_64 execution ==="
arch -x86_64 ./main -h >/dev/null 2>&1 && echo "[whisper-universal] x86_64 OK" || echo "[whisper-universal] x86_64 FAILED"

echo ""
echo "[whisper-universal] Done."
echo "    Binary: $WHISPER_CPP_DIR/main"
echo "    Model:  $WHISPER_CPP_DIR/models/ggml-${MODEL}.bin"
