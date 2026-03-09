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
ARG MILADY_LFS_REPO_URL=""
ARG MILADY_LFS_REF=""
ARG MILADY_LFS_COMMIT=""
ARG GITHUB_TOKEN=""
RUN set -e; \
    GITHUB_TOKEN="${GITHUB_TOKEN}"; \
    REPO_URL_RAW="$MILADY_LFS_REPO_URL"; \
    if [ -z "$REPO_URL_RAW" ] && [ -d .git ]; then REPO_URL_RAW="$(git config --get remote.origin.url || true)"; fi; \
    if [ -z "$REPO_URL_RAW" ]; then REPO_URL_RAW="https://github.com/miladybsc/milady.git"; fi; \
    if echo "$REPO_URL_RAW" | grep -q '^git@github.com:'; then REPO_URL_RAW="$(echo "$REPO_URL_RAW" | sed -E 's#^git@github.com:(.+)$#https://github.com/\1#')"; fi; \
    if echo "$REPO_URL_RAW" | grep -q '^ssh://git@github.com/'; then REPO_URL_RAW="$(echo "$REPO_URL_RAW" | sed -E 's#^ssh://git@github.com/#https://github.com/#')"; fi; \
    POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms apps/app/public/animations || true)"; \
    if [ -n "$POINTERS" ]; then \
      echo '[build] Unresolved Git LFS pointers detected in build context; attempting fallback clone...'; \
      REPO_URL="$REPO_URL_RAW"; \
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
        # LFS budget/quota can block fetch; continue so media.githubusercontent fallback can run.
        git lfs fetch origin "$REF" --include='apps/app/public/vrms' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/mixamo' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/idle.glb' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/Idle.fbx' || true; \
        git lfs fetch origin "$REF" --include='apps/app/public/animations/BreathingIdle.fbx' || true; \
        git lfs checkout apps/app/public/vrms || true; \
        git lfs checkout apps/app/public/animations/mixamo || true; \
        git lfs checkout apps/app/public/animations/idle.glb || true; \
        git lfs checkout apps/app/public/animations/Idle.fbx || true; \
        git lfs checkout apps/app/public/animations/BreathingIdle.fbx || true; \
        cd /app; \
        rm -rf apps/app/public/vrms apps/app/public/animations; \
        mkdir -p apps/app/public/animations; \
        cp -a /tmp/milady-lfs-src/apps/app/public/vrms apps/app/public/; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/mixamo apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/idle.glb apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/Idle.fbx apps/app/public/animations/ || true; \
        cp -a /tmp/milady-lfs-src/apps/app/public/animations/BreathingIdle.fbx apps/app/public/animations/ || true; \
        rm -rf /tmp/milady-lfs-src; \
      else \
        echo '[build] WARNING: fallback clone failed; continuing with existing assets.'; \
      fi; \
    fi; \
    MEDIA_REPO="$REPO_URL_RAW"; \
    MEDIA_REPO_PATH="$(echo "$MEDIA_REPO" | sed -E 's#^https://([^@/]+@)?github.com/([^/]+/[^/.]+)(\\.git)?$#\\2#')"; \
    if [ -z "$MEDIA_REPO_PATH" ] || [ "$MEDIA_REPO_PATH" = "$MEDIA_REPO" ]; then MEDIA_REPO_PATH="miladybsc/milady"; fi; \
    MEDIA_REF="$MILADY_LFS_REF"; \
    if [ -z "$MEDIA_REF" ] && [ -n "${RAILWAY_GIT_BRANCH:-}" ]; then MEDIA_REF="${RAILWAY_GIT_BRANCH}"; fi; \
    if [ -z "$MEDIA_REF" ]; then MEDIA_REF="main"; fi; \
    VRM_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms || true)"; \
    if [ -n "$VRM_POINTERS" ]; then \
      echo '[build] VRM pointers detected after LFS restore; attempting media.githubusercontent fallback...'; \
      echo "$VRM_POINTERS" | while IFS= read -r FILE; do \
        [ -z "$FILE" ] && continue; \
        URL="https://media.githubusercontent.com/media/${MEDIA_REPO_PATH}/${MEDIA_REF}/${FILE}"; \
        echo "[build] downloading $FILE"; \
        curl -fsSL "$URL" -o "$FILE" || true; \
      done; \
    fi; \
    VRM_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/vrms || true)"; \
    if [ -n "$VRM_POINTERS" ]; then \
      echo '[build] ERROR: unresolved Git LFS pointers remain in VRM assets:'; \
      echo "$VRM_POINTERS"; \
      exit 1; \
    fi; \
    ANIMATION_POINTERS="$(grep -RIl '^version https://git-lfs.github.com/spec/v1' apps/app/public/animations || true)"; \
    if [ -n "$ANIMATION_POINTERS" ]; then \
      echo '[build] WARNING: unresolved Git LFS pointers remain in animation assets; build will continue.'; \
      echo "$ANIMATION_POINTERS" | head -n 60; \
    fi

# Install dependencies while skipping third-party postinstall hooks that
# may fail in cloud builders. Then run our required local patch scripts.
RUN bun install --ignore-scripts
RUN node ./scripts/link-browser-server.mjs && node ./scripts/patch-deps.mjs
RUN bun run build

ENV NODE_ENV=production
ENV MILADY_API_BIND="0.0.0.0"
ENV MILADY_STATE_DIR="/data/.milady"
ENV MILADY_CONFIG_PATH="/data/.milady/milady.json"
ENV PGLITE_DATA_DIR="/data/.milady/workspace/.eliza/.elizadb"

# Railway volume mount target. If /data is backed by a persistent volume,
# onboarding/config/database survive redeploys.
RUN mkdir -p /data/.milady/workspace/.eliza/.elizadb

# Railway sets $PORT dynamically. Map it to MILADY_PORT at runtime.
CMD ["sh", "-lc", "MILADY_PORT=${PORT:-2138} node milady.mjs start"]
