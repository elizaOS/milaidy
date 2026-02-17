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

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock* .npmrc ./
COPY apps/app/package.json ./apps/app/package.json
COPY scripts ./scripts

# Install dependencies using the committed lockfile only.
RUN bun install --frozen-lockfile

# Copy source and build (includes apps/app/dist UI bundle)
COPY . .
RUN bun run build

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
