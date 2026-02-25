FROM node:22-bookworm

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

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

# Build backend (tsdown) — don't use `bun run build` because the apps/app
# build script calls `bun install` internally which hits the same native
# module exit-code-1 issue. Inline the steps and skip redundant installs.
RUN bun run build:local-plugins && \
    npx tsdown && \
    echo '{"type":"module"}' > dist/package.json && \
    bun scripts/write-build-info.ts

# Build frontend: Capacitor plugins + Vite (skip inner bun install)
RUN cd apps/app && \
    bun run plugin:build && \
    npx vite build

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
USER node

# Default: bind to 0.0.0.0 in containers so the service is reachable.
# Set MILADY_API_TOKEN in production to require auth.
ENV MILADY_API_BIND="0.0.0.0"

# Kinsta sets PORT env var; bridge it to MILADY_PORT.
# Falls back to 2138 if PORT is not set.
EXPOSE 2138

# Start the API server + dashboard UI.
# Uses shell form so $PORT is expanded at runtime.
CMD sh -c "MILADY_PORT=${PORT:-2138} node milady.mjs start"
