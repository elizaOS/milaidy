FROM node:22-bookworm

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

ARG MILAIDY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILAIDY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILAIDY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy dependency manifests first for better layer caching
COPY package.json ./
COPY apps/app/package.json ./apps/app/package.json
COPY scripts ./scripts

# Install dependencies (repo does not track bun.lock).
RUN bun install

# Copy source and build (includes apps/app/dist UI bundle)
COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV MILAIDY_API_BIND="0.0.0.0"

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app
USER node

# Railway sets $PORT dynamically. Map it to MILAIDY_PORT at runtime.
CMD ["sh", "-lc", "MILAIDY_PORT=${PORT:-2138} node milaidy.mjs start --headless"]
