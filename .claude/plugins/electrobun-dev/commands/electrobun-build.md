---
name: electrobun-build
description: Guided Electrobun build command — selects environment, verifies signing credentials, runs the build, and summarizes artifacts produced.
---

Run a guided Electrobun build.

## Steps

1. **Ask which environment:**
   - A) `dev` — quick local build, no signing, no artifacts
   - B) `canary` — release build for internal testing: sign + notarize + DMG + patch
   - C) `stable` — production release build

2. **For canary or stable — verify signing env vars:**

   ```bash
   echo "DEVELOPER_ID: ${ELECTROBUN_DEVELOPER_ID:-❌ NOT SET}"
   echo "APPLE_ID: ${ELECTROBUN_APPLEID:-❌ NOT SET}"
   echo "APPLE_PASS: ${ELECTROBUN_APPLEIDPASS:-❌ NOT SET}"
   echo "TEAM_ID: ${ELECTROBUN_TEAMID:-❌ NOT SET}"
   ```

   If any are missing:
   - `ELECTROBUN_DEVELOPER_ID`: run `security find-identity -v -p codesigning` to find it
   - `ELECTROBUN_APPLEID`: your Apple Developer account email
   - `ELECTROBUN_APPLEIDPASS`: generate at https://appleid.apple.com → App-Specific Passwords
   - `ELECTROBUN_TEAMID`: visible in your Developer ID string in parentheses

   Offer to skip signing: "Want to skip signing and test the rest of the build pipeline? (ELECTROBUN_SKIP_CODESIGN=1)"

3. **Read `app.version` from `electrobun.config.ts`** and confirm it's correct for this release. If doing canary/stable, ask if they want to bump it first.

4. **Run the build:**
   ```bash
   electrobun build --env=<env>
   ```
   Stream output to the user.

5. **On completion, summarize artifacts:**
   - List everything in `artifacts/` with file sizes
   - Confirm `update.json` is present and show its `version` and `url` fields
   - Tell the user what to do next: "Run `/electrobun-release` to upload and distribute"

6. **On failure**, diagnose the error:
   - Codesign failure → check identity string
   - Missing entrypoint → check `build.bun.entrypoint` path
   - Missing icons → check `build.mac.icons` path
   - Notarization timeout → suggest retry or skip with `ELECTROBUN_SKIP_CODESIGN=1`
