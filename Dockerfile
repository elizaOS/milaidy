FROM node:22-bookworm

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD="true"

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN if [ -n "$MILADY_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $MILADY_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Copy full source so Bun can resolve all workspaces declared in package.json.
COPY . .

# Install dependencies while skipping third-party postinstall hooks that
# may fail in cloud builders. Then run our required local patch scripts.
RUN bun install --ignore-scripts
RUN node ./scripts/link-browser-server.mjs && node ./scripts/patch-deps.mjs
RUN bun run build

ENV NODE_ENV=production
ENV MILADY_API_BIND="0.0.0.0"

# Railway sets $PORT dynamically. Map it to MILADY_PORT at runtime.
CMD ["sh", "-lc", "MILADY_PORT=${PORT:-2138} node milady.mjs start"]
