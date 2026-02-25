FROM node:22-bookworm

# Install Bun to a shared location so both root (build) and node (runtime)
# can use it. BUN_INSTALL=/usr/local puts the binary at /usr/local/bin/bun.
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

WORKDIR /app

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILADY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILADY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy full source first — postinstall hooks need source files
# (build:local-plugins compiles workspace packages like plugin-pi-ai).
COPY . .

# Install deps + run postinstall (which builds local plugins).
# bun install may exit 1 if optional native modules (node-pty, node-llama-cpp,
# whisper-node) fail to compile — these aren't needed for server deployment.
RUN bun install || true

# Build backend — mirrors `bun run build` but skips the redundant inner
# `bun install` calls in apps/app/build (deps are already installed above).
RUN bun run build:local-plugins && \
    bun tsdown && \
    echo '{"type":"module"}' > dist/package.json && \
    bun scripts/write-build-info.ts

# Build frontend: Capacitor plugins + Vite (skip inner bun install)
RUN cd apps/app && \
    bun run plugin:build && \
    bun vite build

ENV NODE_ENV=production

# Pre-create writable runtime directories under the non-root user's home.
# The agent writes config, logs, PGlite data, and skill caches here.
RUN mkdir -p /home/node/.milady/workspace/.eliza/.elizadb \
             /home/node/.eliza && \
    chown -R node:node /home/node

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
USER node

# Default: bind to 0.0.0.0 in containers so the service is reachable.
# MILADY_API_TOKEN can be set via PaaS env vars for production auth.
# If not set and binding to 0.0.0.0, the server auto-generates a random
# token — set it explicitly in your PaaS environment variables.
ENV MILADY_API_BIND="0.0.0.0"

# Kinsta/Sevalla sets PORT env var; bridge it to MILADY_PORT.
# Falls back to 2138 if PORT is not set.
EXPOSE 2138

# Start the API server + dashboard UI.
# Uses shell form so $PORT is expanded at runtime.
CMD sh -c "MILADY_PORT=${PORT:-2138} bun milady.mjs start"
