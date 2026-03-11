---
name: electrobun-release
description: Guided step-by-step release workflow for Electrobun apps — version bump, build, artifact verification, upload to CDN, and auto-updater verification.
---

Walk through the full Electrobun release workflow.

## Steps

1. **Read current state:**
   - `app.version` from `electrobun.config.ts`
   - `release.baseUrl` from config
   - Contents of `artifacts/` (if any)

2. **Version check** — Ask: "Current version is X.Y.Z. Is this correct for the release, or do you want to bump it?"
   - If bump: edit `app.version` in `electrobun.config.ts` and confirm
   - Remind: canary version convention: `1.2.3-canary.1`, stable: `1.2.3`

3. **Check `release.baseUrl`** — If missing, ask for it and add to config:
   ```typescript
   release: {
     baseUrl: "https://your-cdn.com/releases/appname",
     generatePatch: true,
   }
   ```

4. **Check signing credentials:**
   ```bash
   echo "DEVELOPER_ID: ${ELECTROBUN_DEVELOPER_ID:-❌ NOT SET}"
   echo "APPLE_ID: ${ELECTROBUN_APPLEID:-❌ NOT SET}"
   echo "APPLE_PASS: ${ELECTROBUN_APPLEIDPASS:-❌ NOT SET}"
   echo "TEAM_ID: ${ELECTROBUN_TEAMID:-❌ NOT SET}"
   ```
   Stop and guide the user to set any missing vars before continuing.

5. **Ask which channel:** canary (internal testing) or stable (production)?

6. **Run the build:**
   ```bash
   electrobun build --env=<canary|stable>
   ```

7. **Verify artifacts** — List `artifacts/` and confirm:
   - [ ] `.tar.zst` bundle present
   - [ ] `.patch` file present (if not first release, warn if missing)
   - [ ] `update.json` present — show version and url fields
   - [ ] `.dmg` present (macOS)

8. **Upload artifacts** — Ask how they're hosting (S3 / R2 / rsync / other):

   **S3:**
   ```bash
   aws s3 sync artifacts/ s3://<bucket>/releases/<appname>/ --acl public-read
   ```

   **Cloudflare R2:**
   ```bash
   rclone sync artifacts/ r2:<bucket>/releases/<appname>/
   ```

   **rsync:**
   ```bash
   rsync -avz artifacts/ user@server:/var/www/releases/<appname>/
   ```

   Run the command, confirm exit 0.

9. **Verify update.json is reachable:**
   ```bash
   curl -s "<baseUrl>/macos-arm64-update.json" | jq .version
   ```
   Expected: the new version string.

10. **Confirm** — Tell the user: "Release v<version> is live. Running apps on the previous version will detect this update on their next check."

11. **Suggest:** Bump `app.version` to the next pre-release version now to avoid accidentally releasing the same version again.
