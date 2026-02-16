FROM node:22-bookworm

# Install Bun (primary package manager and build tool)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD="true"

ARG MILADY_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git git-lfs $MILADY_DOCKER_APT_PACKAGES && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy full source so Bun can resolve all workspaces declared in package.json.
COPY . .

# Pull large media tracked by Git LFS when git metadata is available (e.g. Railway GitHub deploy).
RUN if [ -d .git ]; then \
      git lfs install --local && \
      git lfs pull || true; \
    fi

# If pointer files remain (common in some cloud build contexts), fallback to
# cloning the repo and pulling LFS assets directly, then overwrite local media.
ARG MILADY_LFS_REPO_URL="https://github.com/cayden970207/milady.git"
ARG MILADY_LFS_REF=""
ARG MILADY_LFS_COMMIT=""
ARG GITHUB_TOKEN=""
RUN set -e; \
    POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms apps/app/public/animations || true)"; \
    if [ -n "$POINTERS" ]; then \
      echo '[build] Unresolved Git LFS pointers detected in build context; attempting fallback clone...'; \
      REPO_URL="$MILADY_LFS_REPO_URL"; \
      REF="$MILADY_LFS_REF"; \
      COMMIT="$MILADY_LFS_COMMIT"; \
      if [ -z "$REF" ] && [ -n "${RAILWAY_GIT_BRANCH:-}" ]; then REF="${RAILWAY_GIT_BRANCH}"; fi; \
      if [ -z "$REF" ]; then REF="main"; fi; \
      if [ -z "$COMMIT" ] && [ -n "${RAILWAY_GIT_COMMIT_SHA:-}" ]; then COMMIT="${RAILWAY_GIT_COMMIT_SHA}"; fi; \
      if [ -n "$GITHUB_TOKEN" ] && echo "$REPO_URL" | grep -q '^https://github.com/'; then \
        REPO_URL="$(echo "$REPO_URL" | sed "s#^https://#https://x-access-token:${GITHUB_TOKEN}@#")"; \
      fi; \
      rm -rf /tmp/milady-lfs-src; \
      if git -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false clone --depth 1 --branch "$REF" "$REPO_URL" /tmp/milady-lfs-src; then \
        cd /tmp/milady-lfs-src; \
        if [ -n "$COMMIT" ]; then \
          git -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false fetch --depth 1 origin "$COMMIT" && GIT_LFS_SKIP_SMUDGE=1 git checkout "$COMMIT"; \
        fi; \
        git lfs install --local; \
        git lfs fetch origin "$REF" --include='apps/app/public/vrms/**' --exclude='*' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/mixamo/**' --exclude='*' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/idle.glb' --exclude='*' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/Idle.fbx' --exclude='*' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/BreathingIdle.fbx' --exclude='*' || true; \
        git lfs checkout apps/app/public/vrms || true; \
        git lfs checkout apps/app/public/animations/mixamo || true; \
        git lfs checkout apps/app/public/animations/idle.glb || true; \
        git lfs checkout apps/app/public/animations/Idle.fbx || true; \
        git lfs checkout apps/app/public/animations/BreathingIdle.fbx || true; \
        cd /app; \
        rm -rf apps/app/public/vrms apps/app/public/animations; \
        mkdir -p apps/app/public/animations; \
        cp -a /tmp/milady-lfs-src/apps/app/public/vrms apps/app/public/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/mixamo apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/idle.glb apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/Idle.fbx apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/BreathingIdle.fbx apps/app/public/animations/ || true; \
        rm -rf /tmp/milady-lfs-src; \
      else \
        echo '[build] WARNING: fallback clone failed; continuing with existing assets.'; \
      fi; \
    fi; \
    POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms apps/app/public/animations || true)"; \
    if [ -n "$POINTERS" ]; then \
      echo '[build] WARNING: unresolved Git LFS media pointers remain; build will continue.'; \
      echo "$POINTERS" | head -n 60; \
    fi

# Install dependencies while skipping third-party postinstall hooks that
# may fail in cloud builders. Then run our required local patch scripts.
RUN bun install --ignore-scripts
RUN node ./scripts/link-browser-server.mjs && node ./scripts/patch-deps.mjs
RUN bun run build

ENV NODE_ENV=production
ENV MILADY_API_BIND="0.0.0.0"

# Railway sets $PORT dynamically. Map it to MILADY_PORT at runtime.
CMD ["sh", "-lc", "MILADY_PORT=${PORT:-2138} node milady.mjs start"]
