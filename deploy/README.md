# Milady Cloud Image — Build & Deploy

## Overview

The `milady/agent:cloud-full-ui` Docker image bundles the full Milaidy runtime (agent + UI + bridge) into a single container. It's used by Milady Cloud to run agent instances on Docker nodes.

### Image Architecture

```
┌─────────────────────────────────────────┐
│  milady/agent:cloud-full-ui             │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  cloud-full-ui-entrypoint.sh     │   │
│  │                                  │   │
│  │  ├─ node milady.mjs start    :2138/2139  (UI + API)
│  │  └─ tsx cloud-agent-entrypoint.ts        │
│  │     ├─ Bridge HTTP           :31337      │
│  │     └─ Compat listener       :18790      │
│  └──────────────────────────────────┘   │
│                                         │
│  Base: node:22-bookworm + bun           │
│  Size: ~14 GB (full build with deps)    │
└─────────────────────────────────────────┘
```

### Ports

| Port  | Service                     |
|-------|-----------------------------|
| 2138  | Milady API (`MILADY_PORT`)  |
| 2139  | UI Server (`PORT`)          |
| 31337 | Bridge HTTP (`BRIDGE_PORT`) |
| 18790 | Compat bridge (`BRIDGE_COMPAT_PORT`) |

---

## Quick Start

### Build a new image

```bash
# Build with latest git tag
./deploy/build-cloud-image.sh

# Build specific version
./deploy/build-cloud-image.sh v2.0.0-alpha.81

# Build and push to all nodes
./deploy/build-cloud-image.sh --push

# Build without cache
./deploy/build-cloud-image.sh --no-cache --push v2.0.0-alpha.81
```

### Deploy to nodes

```bash
# Check current status
./deploy/deploy-to-nodes.sh --status

# List running containers
./deploy/deploy-to-nodes.sh --list

# Load image to all nodes (no restart)
./deploy/deploy-to-nodes.sh

# Load + restart all containers
./deploy/deploy-to-nodes.sh --restart

# Rolling restart (one at a time, wait for healthy)
./deploy/deploy-to-nodes.sh --restart --rolling

# Deploy to a single node
./deploy/deploy-to-nodes.sh --node agent-node-1 --restart
```

---

## Build Process

### What the build does

1. Starts from `node:22-bookworm`
2. Installs `bun` (via `bun.sh/install`)
3. Copies the entire Milaidy repo into `/app`
4. Runs `bun install --frozen-lockfile`
5. Runs `bun run build`
6. Installs `tsx` globally (for the bridge entrypoint)
7. Sets up health check on `/health`

### Dockerfile

The build uses `deploy/Dockerfile.cloud-full-ui`. Key points:

- **Full repo copy** — the entire Milaidy monorepo is copied in
- **Production build** — runs `bun run build` to compile everything
- **Non-root** — runs as `node` user
- **Health check** — `curl http://localhost:$PORT/health` every 30s

### Build args

| Arg | Description |
|-----|-------------|
| `MILADY_DOCKER_APT_PACKAGES` | Extra apt packages to install (optional) |
| `BUILD_VERSION` | Version tag (set by build script) |
| `BUILD_SHA` | Git commit SHA (set by build script) |

---

## Docker Nodes

### Current nodes

| Node | IP | SSH |
|------|----|----|
| agent-node-1 | 37.27.190.196 | `ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196` |
| nyx-node | 89.167.49.4 | `ssh -i ~/.ssh/clawdnet_nodes root@89.167.49.4` |

### Image transfer

Images are transferred via `docker save | ssh docker load` (no registry pull on nodes). This is because:
- The nodes don't have registry credentials configured
- Image is ~14 GB, transfer takes a few minutes over SSH
- Simple and reliable

### Container naming

Containers are named `milady-{uuid}` (e.g., `milady-b68b5ef1-fe83-48a5-8f31-1d24d7a329b1`). They're created by the Milady Cloud orchestrator.

---

## Updating Running Containers

### Safe update process

1. **Build** the new image locally
2. **Deploy** to nodes (loads image, doesn't restart)
3. **Check** current containers: `./deploy/deploy-to-nodes.sh --list`
4. **Restart** with snapshots: `./deploy/deploy-to-nodes.sh --restart --rolling`

### What `--restart` does

For each running container:
1. Creates a snapshot (`docker commit`) with timestamp
2. Inspects the container's env vars, ports, volumes, networks
3. Stops and removes the old container
4. Starts a new container with the same config but new image
5. (With `--rolling`) waits for health check to pass before next

### Manual container restart

If you need to restart a specific container:

```bash
NODE=37.27.190.196
CONTAINER=milady-b68b5ef1-fe83-48a5-8f31-1d24d7a329b1
SSH="ssh -i ~/.ssh/clawdnet_nodes root@$NODE"

# Snapshot
$SSH "docker commit $CONTAINER ${CONTAINER}-backup-$(date +%Y%m%d)"

# Get config
$SSH "docker inspect $CONTAINER" > /tmp/container-config.json

# Restart
$SSH "docker stop -t 30 $CONTAINER && docker rm $CONTAINER"
# Recreate with same env/ports (see inspect output)
```

---

## Release Workflow

### Version relationship

- Milaidy releases create git tags like `v2.0.0-alpha.81`
- Cloud images are tagged: `cloud-full-ui` (latest) + `cloud-full-ui-2.0.0-alpha.81` (versioned)
- Not every Milaidy release needs a new cloud image
- Cloud images are rebuilt when there are relevant changes to the runtime/UI/bridge

### GitHub Actions (CI)

The `build-cloud-image.yml` workflow:
- **Auto-triggers** on `v*` tag pushes
- **Manual trigger** via workflow_dispatch with optional version
- Builds and pushes to GitHub Container Registry (ghcr.io)
- Uses Docker layer caching for faster rebuilds

To use the CI-built image on nodes:
```bash
# Pull from GHCR (requires login)
docker pull ghcr.io/milady-ai/milaidy/agent:cloud-full-ui

# Or continue using the local build + SSH transfer method
./deploy/build-cloud-image.sh --push
```

### Typical update flow

```
git tag v2.0.0-alpha.82
git push origin v2.0.0-alpha.82
  → CI builds and pushes to GHCR (automatic)
  → OR: ./deploy/build-cloud-image.sh --push v2.0.0-alpha.82 (manual)
./deploy/deploy-to-nodes.sh --restart --rolling
```

---

## Troubleshooting

### Container won't start

```bash
ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196 \
  "docker logs --tail 100 milady-CONTAINER-NAME"
```

### Health check failing

The health check hits `http://localhost:$PORT/health`. Common issues:
- UI server didn't start (check entrypoint logs)
- Port conflict
- Missing env vars

### Image too large

The image is ~14 GB because it includes the full monorepo build. To reduce:
- Consider a multi-stage build that only copies dist output
- Use `.dockerignore` to exclude test files, docs, etc.

### SSH transfer slow

For large images over slow connections:
```bash
# Compress during transfer
docker save milady/agent:cloud-full-ui | gzip | \
  ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196 "gunzip | docker load"
```

---

## Files

| File | Description |
|------|-------------|
| `Dockerfile.cloud-full-ui` | Docker build file for the cloud image |
| `cloud-full-ui-entrypoint.sh` | Container entrypoint (starts UI + bridge) |
| `cloud-agent-entrypoint.ts` | Bridge server TypeScript entrypoint |
| `build-cloud-image.sh` | Build script (local Docker build) |
| `deploy-to-nodes.sh` | Deploy script (push to nodes, restart containers) |
| `.github/workflows/build-cloud-image.yml` | CI workflow for automated builds |
