#!/usr/bin/env bash
set -euo pipefail

# Smoke-test the production Docker build path used by .github/workflows/build-docker.yml.
#
# What this does:
#   1. Installs deps with bun using the committed lockfile
#   2. Builds required runtime/UI artifacts for Dockerfile.ci
#   3. Builds the production image locally
#   4. Optionally boots the container and probes /api/health or /api/status
#
# Usage:
#   scripts/docker-ci-smoke.sh [--tag TAG] [--version VERSION] [--skip-smoke]
#
# Environment:
#   BUN_VERSION          Bun version to install/use in CI (default: 1.3.9)
#   SMOKE_PORT           Host port to bind for smoke boot (default: 32138)
#   SMOKE_TIMEOUT_SEC    Max wait for boot probe (default: 180)
#   DOCKER_IMAGE         Override image tag completely

BUN_VERSION="${BUN_VERSION:-1.3.9}"
SMOKE_PORT="${SMOKE_PORT:-32138}"
SMOKE_TIMEOUT_SEC="${SMOKE_TIMEOUT_SEC:-180}"
SKIP_SMOKE=false
TAG="docker-smoke"
VERSION=""

log() {
  printf '[docker-ci-smoke] %s\n' "$*"
}

fail() {
  printf '[docker-ci-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --skip-smoke)
      SKIP_SMOKE=true
      shift
      ;;
    -h|--help)
      sed -n '1,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

[[ -f package.json ]] || fail "Run from the repo root"
[[ -f Dockerfile.ci ]] || fail "Dockerfile.ci not found"
[[ -f .dockerignore.ci ]] || fail ".dockerignore.ci not found"

if [[ -z "$VERSION" ]]; then
  VERSION="v$(node -p "require('./package.json').version")-docker-smoke"
fi
VERSION_CLEAN="${VERSION#v}"
DOCKER_IMAGE="${DOCKER_IMAGE:-miladyai/agent:${TAG}}"
CONTAINER_NAME="milady-docker-smoke-${TAG//[^a-zA-Z0-9_.-]/-}"

log "Repo root: $REPO_ROOT"
log "Version: $VERSION"
log "Image: $DOCKER_IMAGE"
log "Smoke port: $SMOKE_PORT"

command -v docker >/dev/null 2>&1 || fail "docker is required"
command -v node >/dev/null 2>&1 || fail "node is required"
command -v bun >/dev/null 2>&1 || fail "bun is required"

docker info >/dev/null 2>&1 || fail "docker daemon is not available"

DOCKERIGNORE_BACKUP="$(mktemp)"
cp .dockerignore "$DOCKERIGNORE_BACKUP"
cleanup() {
  set +e
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if [[ -f "$DOCKERIGNORE_BACKUP" ]]; then
    cp "$DOCKERIGNORE_BACKUP" .dockerignore >/dev/null 2>&1 || true
    rm -f "$DOCKERIGNORE_BACKUP" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "Installing dependencies"
bun install --frozen-lockfile --ignore-scripts

log "Building Capacitor plugins"
pushd apps/app >/dev/null
bun scripts/plugin-build.mjs
popd >/dev/null

log "Building runtime dist"
npx tsdown
echo '{"type":"module"}' > dist/package.json
node --import tsx scripts/write-build-info.ts 2>/dev/null || true

log "Building app UI"
pushd apps/app >/dev/null
NODE_ENV=production npx vite build
popd >/dev/null

log "Preparing CI dockerignore"
cp .dockerignore.ci .dockerignore

log "Building Docker image"
docker build \
  --file Dockerfile.ci \
  --tag "$DOCKER_IMAGE" \
  --build-arg "VERSION=$VERSION" \
  --build-arg "VERSION_CLEAN=$VERSION_CLEAN" \
  .

if $SKIP_SMOKE; then
  log "Skipping runtime smoke boot (--skip-smoke)"
  exit 0
fi

log "Starting container smoke boot"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${SMOKE_PORT}:2138" \
  "$DOCKER_IMAGE" >/dev/null

status_url="http://127.0.0.1:${SMOKE_PORT}/api/status"
health_url="http://127.0.0.1:${SMOKE_PORT}/api/health"

probe_ok() {
  local url="$1"
  local out="$2"
  local code
  code="$(curl -sS -o "$out" -w '%{http_code}' "$url" || true)"
  case "$code" in
    200)
      return 0
      ;;
    401)
      if grep -q 'Unauthorized' "$out" 2>/dev/null; then
        return 0
      fi
      ;;
  esac
  return 1
}

deadline=$((SECONDS + SMOKE_TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  if ! docker ps --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
    docker logs "$CONTAINER_NAME" || true
    fail "Container exited before smoke probe succeeded"
  fi

  if probe_ok "$health_url" /tmp/milady-docker-health.txt; then
    log "Health probe succeeded: $health_url"
    cat /tmp/milady-docker-health.txt
    exit 0
  fi

  if probe_ok "$status_url" /tmp/milady-docker-status.txt; then
    log "Status probe succeeded: $status_url"
    cat /tmp/milady-docker-status.txt
    exit 0
  fi

  sleep 5
done

docker logs "$CONTAINER_NAME" || true
fail "Timed out waiting for container smoke probe (${SMOKE_TIMEOUT_SEC}s)"
