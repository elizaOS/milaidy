#!/usr/bin/env bash
#
# build-whisper-universal.sh
#
# Builds whisper.cpp's `main` binary as a macOS universal binary (arm64 + x86_64).
# This ensures the whisper-node shell wrapper works on both Apple Silicon and Intel Macs.
#
# Usage: ./scripts/build-whisper-universal.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WHISPER_CPP_DIR="$ELECTRON_DIR/node_modules/whisper-node/lib/whisper.cpp"

if [ ! -d "$WHISPER_CPP_DIR" ]; then
  echo "[whisper-universal] whisper.cpp directory not found at $WHISPER_CPP_DIR"
  echo "[whisper-universal] Run 'npm install' in the electron directory first."
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

CAN_BUILD_X86=1
if ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
  CAN_BUILD_X86=0
fi

if [ "$CAN_BUILD_X86" -eq 1 ]; then
  # --- x86_64 build (via Rosetta on Apple Silicon, or native on Intel) ---
  # Disable Metal for x86_64 since older Intel Macs may lack GPU support,
  # and Accelerate framework handles CPU-based BLAS on all macOS versions.
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
else
  echo "[whisper-universal] Rosetta/x86_64 build unavailable; keeping arm64 binary only."
  mv main_arm64 main
  echo "[whisper-universal] Result: $(file main)"
  echo ""
fi

# --- Verify binary executes ---
echo "[whisper-universal] === Verifying arm64 execution ==="
./main -h >/dev/null 2>&1 && echo "[whisper-universal] arm64 OK" || echo "[whisper-universal] arm64 FAILED"

if [ "$CAN_BUILD_X86" -eq 1 ]; then
  echo "[whisper-universal] === Verifying x86_64 execution ==="
  arch -x86_64 ./main -h >/dev/null 2>&1 && echo "[whisper-universal] x86_64 OK" || echo "[whisper-universal] x86_64 FAILED"
fi

echo ""
echo "[whisper-universal] Done. Binary ready at: $WHISPER_CPP_DIR/main"
