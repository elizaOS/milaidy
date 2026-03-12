---
name: electrobun-workflow
description: Show the full Electrobun pipeline status for the current project and jump-start any stage. Detects init/dev/build/release state automatically.
---

Show the Electrobun development pipeline status and help the user advance to the next stage.

## Steps

1. **Detect project state** by checking:
   - Does `electrobun.config.ts` exist? → Stage 1+ (init complete)
   - Does `build/` directory have content? → Stage 2+ (dev has run)
   - Does `artifacts/` directory have content? → Stage 3+ (build has run)
   - Does `release.baseUrl` have a value in config AND is `artifacts/` populated? → Stage 4+ (release ready)

2. **Print pipeline status** with clear visual markers:

   ```
   Electrobun Pipeline — <app.name> v<app.version>

   [✅ INIT]  → template scaffolded, bun install done
   [✅ DEV]   → build/dev-macos-arm64/ exists
   [⏳ BUILD] → no artifacts found yet   ← YOU ARE HERE
   [⬜ RELEASE] → waiting for build
   ```

3. **For the current stage**, show the exact command(s) to run and any prerequisites:
   - **Stage 1 (init):** Show `electrobun init` with template picker
   - **Stage 2 (dev):** Show `bun run dev` / `electrobun dev --watch`
   - **Stage 3 (build):** Check signing env vars, show `electrobun build --env=canary`
   - **Stage 4 (release):** Show artifact upload commands and `update.json` verification

4. **For build stage**, verify signing prerequisites:
   ```bash
   echo "ELECTROBUN_DEVELOPER_ID: ${ELECTROBUN_DEVELOPER_ID:-NOT SET}"
   echo "ELECTROBUN_APPLEID: ${ELECTROBUN_APPLEID:-NOT SET}"
   echo "ELECTROBUN_APPLEIDPASS: ${ELECTROBUN_APPLEIDPASS:-NOT SET}"
   echo "ELECTROBUN_TEAMID: ${ELECTROBUN_TEAMID:-NOT SET}"
   ```
   If any are missing, show exactly what to set and where to get each value.

5. **Ask the user** if they want to jump-start the current stage or advance to a specific stage.

6. **If they confirm**, run the appropriate command and stream output.
