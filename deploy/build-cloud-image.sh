#!/usr/bin/env bash
# build-cloud-image.sh — Build milady cloud Docker images
#
# Usage:
#   ./deploy/build-cloud-image.sh [OPTIONS] [VERSION]
#
# Targets (pick one):
#   --slim          Build Dockerfile.cloud-agent (bridge-only, ~200MB)
#   --full          Build Dockerfile.cloud-full  (milady + bridge, ~2-3GB)
#   (default)       Build --full
#
# Options:
#   --push          Push image to Docker nodes via SSH after building
#   --no-cache      Build without Docker cache
#   --platform ARCH Build for specific platform (default: linux/amd64)
#   --dry-run       Show what would be done without executing
#   -h, --help      Show this help
#
# Examples:
#   ./deploy/build-cloud-image.sh --slim                   # Slim bridge-only
#   ./deploy/build-cloud-image.sh --full --push            # Full image, push to nodes
#   ./deploy/build-cloud-image.sh --slim --push v2.0.0-alpha.81

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
IMAGE_NAME="milady/agent"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/clawdnet_nodes}"
SSH_USER="${SSH_USER:-root}"

NODES=(
  "agent-node-1:37.27.190.196"
  "nyx-node:89.167.49.4"
)

# ── Defaults ──────────────────────────────────────────────────────────────────
TARGET="full"  # --slim or --full
PUSH=false
NO_CACHE=""
PLATFORM="linux/amd64"
DRY_RUN=false
VERSION=""

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[build]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

# ── Parse Args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --slim)      TARGET="slim"; shift ;;
    --full)      TARGET="full"; shift ;;
    --push)      PUSH=true; shift ;;
    --no-cache)  NO_CACHE="--no-cache"; shift ;;
    --platform)  PLATFORM="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=true; shift ;;
    -h|--help)
      head -25 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    -*)
      err "Unknown option: $1"
      exit 1
      ;;
    *)
      VERSION="$1"; shift ;;
  esac
done

# ── Resolve target ────────────────────────────────────────────────────────────
case $TARGET in
  slim)
    DOCKERFILE="deploy/Dockerfile.cloud-agent"
    IMAGE_TAG="cloud-slim"
    log "Target: ${YELLOW}slim${NC} (bridge-only, Dockerfile.cloud-agent)"
    ;;
  full)
    DOCKERFILE="deploy/Dockerfile.cloud-full"
    IMAGE_TAG="cloud-full"
    log "Target: ${YELLOW}full${NC} (milady + bridge, Dockerfile.cloud-full)"
    ;;
  *)
    err "Unknown target: $TARGET"
    exit 1
    ;;
esac

# ── Resolve version ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "$VERSION" ]]; then
  VERSION="$(git tag --sort=-creatordate | head -1 2>/dev/null || echo "")"
  if [[ -z "$VERSION" ]]; then
    VERSION="dev"
    warn "No version specified and no git tags found, using 'dev'"
  else
    log "Auto-detected version: ${YELLOW}${VERSION}${NC}"
  fi
fi

VERSION_CLEAN="${VERSION#v}"
GIT_SHA="$(git rev-parse --short HEAD)"

FULL_TAG="${IMAGE_NAME}:${IMAGE_TAG}"
VERSIONED_TAG="${IMAGE_NAME}:${IMAGE_TAG}-${VERSION_CLEAN}"
SHA_TAG="${IMAGE_NAME}:${IMAGE_TAG}-sha-${GIT_SHA}"

log "Image:     ${YELLOW}${FULL_TAG}${NC}"
log "Versioned: ${YELLOW}${VERSIONED_TAG}${NC}"
log "SHA:       ${YELLOW}${SHA_TAG}${NC}"
log "Platform:  ${PLATFORM}"
log "Git SHA:   ${GIT_SHA}"

if $DRY_RUN; then
  warn "DRY RUN — would build and tag:"
  echo "  docker build -f $DOCKERFILE -t $FULL_TAG -t $VERSIONED_TAG -t $SHA_TAG ."
  if $PUSH; then
    echo "  Would push to: ${NODES[*]}"
  fi
  exit 0
fi

# ── Verify Dockerfile exists ─────────────────────────────────────────────────
if [[ ! -f "$DOCKERFILE" ]]; then
  err "Dockerfile not found: $DOCKERFILE"
  exit 1
fi

# ── Build ─────────────────────────────────────────────────────────────────────
log "Building Docker image..."
BUILD_START=$(date +%s)

docker build \
  --platform "$PLATFORM" \
  -f "$DOCKERFILE" \
  $NO_CACHE \
  --build-arg "BUILD_VERSION=${VERSION}" \
  --build-arg "BUILD_SHA=${GIT_SHA}" \
  -t "$FULL_TAG" \
  -t "$VERSIONED_TAG" \
  -t "$SHA_TAG" \
  .

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
ok "Image built in ${BUILD_DURATION}s"

# Show image size
docker images "$FULL_TAG" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.ID}}"

# ── Push to nodes ─────────────────────────────────────────────────────────────
if $PUSH; then
  log "Pushing image to Docker nodes..."

  TMPFILE=$(mktemp /tmp/milady-image-XXXXXX.tar)
  trap "rm -f $TMPFILE" EXIT

  log "Saving image to tarball..."
  docker save "$FULL_TAG" "$VERSIONED_TAG" "$SHA_TAG" > "$TMPFILE"
  TAR_SIZE=$(du -h "$TMPFILE" | cut -f1)
  ok "Saved image ($TAR_SIZE)"

  for node_entry in "${NODES[@]}"; do
    NODE_NAME="${node_entry%%:*}"
    NODE_IP="${node_entry##*:}"

    log "Pushing to ${YELLOW}${NODE_NAME}${NC} (${NODE_IP})..."
    PUSH_START=$(date +%s)

    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
      -i "$SSH_KEY" "${SSH_USER}@${NODE_IP}" \
      "docker load" < "$TMPFILE"

    PUSH_END=$(date +%s)
    PUSH_DURATION=$((PUSH_END - PUSH_START))
    ok "Pushed to ${NODE_NAME} in ${PUSH_DURATION}s"
  done

  ok "All nodes updated"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
ok "Build complete!"
echo "  Image:     $FULL_TAG"
echo "  Version:   $VERSIONED_TAG"
echo "  SHA:       $SHA_TAG"
echo "  Git:       $GIT_SHA ($VERSION)"
if ! $PUSH; then
  echo ""
  echo "  To push to nodes:"
  echo "    $0 --push ${TARGET:+--$TARGET }$VERSION"
  echo "  Or use deploy script:"
  echo "    ./deploy/deploy-to-nodes.sh --image $FULL_TAG"
fi
