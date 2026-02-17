FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /repo
COPY package.json ./
RUN bun install

COPY . .
COPY scripts/docker/cleanup-smoke/run.sh /usr/local/bin/milady-cleanup-smoke
RUN chmod +x /usr/local/bin/milady-cleanup-smoke

ENTRYPOINT ["/usr/local/bin/milady-cleanup-smoke"]
