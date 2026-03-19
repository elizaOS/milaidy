# ==============================================================================
# Stage 1: Builder — install all deps and build
# ==============================================================================
FROM node:22-bookworm AS builder

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.9"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock* .npmrc ./
COPY apps/app/package.json ./apps/app/package.json
COPY scripts ./scripts

# Install ALL dependencies (dev + prod) for the build step.
RUN bun install --frozen-lockfile

# Copy source and build (includes apps/app/dist UI bundle)
COPY . .
RUN bun run build

# Re-install with production-only dependencies for the runtime image.
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# ==============================================================================
# Stage 2: Runtime — lean production image without dev deps or source
# ==============================================================================
FROM node:22-bookworm AS runtime

# Install Bun (needed at runtime for bun-native modules)
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.9"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILADY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILADY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy production node_modules (no devDependencies)
COPY --from=builder /app/node_modules ./node_modules

# Copy build outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/app/dist ./apps/app/dist

# Copy entrypoint and runtime scripts
COPY --from=builder /app/milady.mjs ./milady.mjs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

# Copy static assets (VRMs, animations, etc.)
COPY --from=builder /app/apps/app/public ./apps/app/public

# Copy workspace package.json files so Node module resolution works
COPY --from=builder /app/apps/app/package.json ./apps/app/package.json
COPY --from=builder /app/apps/app/node_modules ./apps/app/node_modules

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
USER node

# Default: bind to 0.0.0.0 in containers so the service is reachable.
# Set MILADY_API_TOKEN in production to require auth.
ENV MILADY_API_BIND="0.0.0.0"

# Start the API server + dashboard UI on port 2138.
CMD ["node", "milady.mjs", "start"]
