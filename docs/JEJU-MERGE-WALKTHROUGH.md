# Step-by-step: Merge latest develop and keep the Jeju plugin

Follow these steps in order. If something fails, stop and re-read the step before continuing.

---

## Part 1: Save your current work (no risk to your code)

### Step 1.1 — See what you have

Open a terminal in the repo root and run:

```bash
cd /home/secure-dev/Dev/dfinity/partners/shaw/agents/main
git status
```

You should see:
- **Modified** files (e.g. `src/api/server.ts`, `PluginsView.tsx`, …)
- **Untracked** files (e.g. `src/plugins/jeju/`, `JejuPluginPanel.tsx`)

That’s all your Jeju work. We’re going to put it in a safe branch.

### Step 1.2 — Create a backup branch and commit everything

Run these one at a time:

```bash
git checkout -b jeju-backup
```

This creates a new branch called `jeju-backup` and switches to it. Your files don’t change; you’re just “on” this branch now.

```bash
git add -A
```

This stages every change (modified and untracked), including the whole `src/plugins/jeju/` folder.

```bash
git status
```

Check that the list looks right (all Jeju-related stuff staged).

```bash
git commit -m "Jeju plugin: wallet, swap, dashboard, test connection"
```

Your Jeju work is now saved in a commit on `jeju-backup`. You can always get back to it with `git checkout jeju-backup`.

---

## Part 2: Update develop and merge upstream

### Step 2.1 — Switch to develop and pull the latest

```bash
git checkout develop
```

You’re back on `develop`. Your working directory will now match the last commit on `develop` (before any new merge). The Jeju code is **not** on this branch; it’s safe on `jeju-backup`.

```bash
git fetch origin develop
```

This only downloads the latest commits from GitHub; it does **not** change your files yet.

```bash
git merge origin/develop
```

This tries to apply all the new commits from the remote `develop` onto your local `develop`.

**What you might see:**

- **“Already up to date.”**  
  Then you’re already on the latest. Skip to Part 3.

- **Merge succeeds with “Fast-forward” or “Merge made by …”**  
  No conflicts. Go to Part 3.

- **“CONFLICT” messages**  
  Then there are conflicts. Continue to Part 2.2.

### Step 2.2 — If you see conflicts (only do this if merge said CONFLICT)

The merge will list conflicted files. You’ll see something like:

```
Auto-merging some/file.ts
CONFLICT (content): Merge conflict in some/file.ts
```

**Do not panic.** We will resolve by **keeping upstream’s version** for files that moved or were replaced, then re-add Jeju in the right places.

#### Option A — You want to accept upstream’s version for a file

For any file where upstream **replaced** the whole thing (e.g. `src/api/server.ts`, `src/runtime/eliza.ts`, or `apps/app/.../PluginsView.tsx`), the safest is to take **their** version and re-add Jeju later:

```bash
git checkout --theirs path/to/file
git add path/to/file
```

Example if `src/api/server.ts` conflicts:

```bash
git checkout --theirs src/api/server.ts
git add src/api/server.ts
```

Use the **exact path** git printed in the CONFLICT message.

#### Option B — You see conflict markers in a file

If you open a file and see:

```
<<<<<<< HEAD
our code
=======
their code
>>>>>>> origin/develop
```

- **HEAD** = your side (current branch, e.g. develop before merge).
- **origin/develop** = their side (upstream).

For files that **no longer exist** on upstream (e.g. `apps/app/src/components/PluginsView.tsx`), delete the file and accept that the real version is now in `packages/app-core`:

```bash
git rm apps/app/src/components/PluginsView.tsx
```

(If git says “not found”, the merge may have already removed it; then just `git add` the removal.)

For other conflicted files where you’re unsure: **keep their version** so the project builds:

```bash
git checkout --theirs path/to/file
git add path/to/file
```

#### After resolving every conflicted file

Check for remaining conflicts:

```bash
git status
```

Under “Unmerged paths” there should be nothing left. Fix any remaining files with Option A or B, then:

```bash
git add .
git commit -m "Merge origin/develop"
```

No need to write a long message; “Merge origin/develop” is enough.

---

## Part 3: Bring Jeju back onto the updated code

Now we merge your backup branch. Your Jeju commit will be applied on top of the updated `develop`. There will likely be **new conflicts** because the same *areas* of the code changed (server, eliza, PluginsView), but in different files now.

```bash
git merge jeju-backup
```

Again you might see CONFLICTs.

### Strategy for these conflicts

- **Files that no longer exist on develop** (e.g. `apps/app/src/components/PluginsView.tsx`):  
  **Resolve by accepting *our* version** so the file exists again, **or** (better) **drop that path** and instead we’ll add the same logic into the new location in `packages/app-core`.  
  Easiest: take **ours** for the deleted file so you have the content, then we’ll port it in the next part:

  ```bash
  git checkout --ours apps/app/src/components/PluginsView.tsx
  git add apps/app/src/components/PluginsView.tsx
  ```

  If the merge already says “deleted by us” and the file is gone, that’s OK — we’ll recreate the UI in `packages/app-core` in Part 4.

- **`src/api/server.ts`**  
  On the new develop this file is a one-line re-export. So:
  - Prefer **theirs** (the re-export):  
    `git checkout --theirs src/api/server.ts` then `git add src/api/server.ts`
  - We’ll add all Jeju server logic into `packages/autonomous/src/api/server.ts` in Part 4.

- **`src/runtime/eliza.ts`**  
  Same idea: on develop it’s a stub. Prefer **theirs**:
  ```bash
  git checkout --theirs src/runtime/eliza.ts
  git add src/runtime/eliza.ts
  ```

- **`tsdown.config.ts`**  
  If both sides changed it, open the file. Keep upstream’s structure and **add** only the Jeju block (same as the WhatsApp block, but for `src/plugins/jeju/index.ts` → `dist/plugins/jeju`). Remove conflict markers, save, then:

  ```bash
  git add tsdown.config.ts
  ```

- **`bun.lock`**  
  Easiest: take theirs and reinstall:
  ```bash
  git checkout --theirs bun.lock
  git add bun.lock
  bun install
  ```

- **`src/plugins/jeju/`**  
  These are new files; usually no conflict. If any show as conflicted, keep **ours**:
  ```bash
  git checkout --ours src/plugins/jeju/index.ts
  git add src/plugins/jeju/
  ```
  (Repeat for any file under `src/plugins/jeju/` that’s listed, or `git add src/plugins/jeju/`.)

After all conflicts are resolved:

```bash
git status
```

Ensure no “Unmerged paths”. Then:

```bash
git add .
git commit -m "Re-apply Jeju plugin after upstream merge"
```

---

## Part 4: Port Jeju into the new package layout (required)

After the merge, the **running** server and UI come from `packages/autonomous` and `packages/app-core`. So we must put the Jeju logic there. The following is a checklist; you can do it yourself or ask for help file-by-file.

1. **Plugin runtime (eliza)**  
   - Open `packages/autonomous/src/runtime/eliza.ts`.
   - Find `OPTIONAL_PLUGIN_MAP` and add: `jeju: "@milady/plugin-jeju",`
   - Find where other plugins are removed when explicitly disabled (e.g. “Dashboard disable for Jeju overrides plugins.allow”) and add the same for `@milady/plugin-jeju`.

2. **Plugin tests**  
   - Open `packages/autonomous/src/runtime/eliza.test.ts` (or the test file next to that eliza).
   - Add tests for “loads @milady/plugin-jeju when plugins.entries.jeju is enabled” and “does not load when plugins.entries.jeju.enabled is false” (and optionally “allow + entries false”).

3. **API server (catalog, /api/jeju/status, test connection)**  
   - Open `packages/autonomous/src/api/server.ts`.
   - Add `buildBundledJejuPluginEntry`, add Jeju to the list in `discoverPluginsFromManifest`, add `GET /api/jeju/status`, add the `POST /api/plugins/jeju/test` block with `console.log` for terminal, and add `MILADY_BUNDLED_PLUGIN_PACKAGE` for the PUT handler.
   - (This is a direct port of what you had in the old `src/api/server.ts`; only the file path changes.)

4. **Dashboard UI**  
   - In `packages/app-core/src/components/PluginsView.tsx`: add Landmark icon, `jeju` in the feature subgroup, the Test Connection handling (including error/message and toasts), show Test button for `p.id === "jeju" && p.enabled`, and the game-modal test button text from `testResults`.
   - Add `packages/app-core/src/components/JejuPluginPanel.tsx` (same as your current panel; fix imports to use `@miladyai/ui` and app-core’s `client` / `useApp`).

5. **Build**  
   - In repo root `tsdown.config.ts`, ensure there is an entry for `src/plugins/jeju/index.ts` with `outDir: "dist/plugins/jeju"` (and `external: [... nativeExternals, "ethers"]`).

6. **Paths for Jeju client in autonomous**  
   - In `packages/autonomous/src/api/server.ts`, the code that does `findOwnPackageRoot` and `path.join(..., "dist/plugins/jeju/client.js")` may need to use the **repo root** as package root (where `dist/plugins/jeju` lives), not the autonomous package folder. If after merge the Jeju test fails with “plugin not built”, we’ll fix that path (often by resolving root from `import.meta.url` or a known workspace root).

---

## Part 5: Sanity check

```bash
bun install
bun run build
```

If the build passes:

- Start Milady, open Settings → Plugins, enable Jeju, click Test connection. You should see terminal output and the wallet.
- In chat, ask for wallet/balance and a small swap.

If anything fails, note the error (and file/line if given) and we can fix the port step by step.

---

## Quick reference

| Step | Command / action |
|------|-------------------|
| 1.2  | `git checkout -b jeju-backup` → `git add -A` → `git commit -m "Jeju plugin: ..."` |
| 2.1  | `git checkout develop` → `git fetch origin develop` → `git merge origin/develop` |
| 2.2  | Resolve conflicts with `git checkout --theirs <file>` (or `--ours` where we keep our content), then `git add` and `git commit` |
| 3    | `git merge jeju-backup`; resolve again; prefer **theirs** for stubs (`server.ts`, `eliza.ts`), **ours** for `src/plugins/jeju` and maybe old `PluginsView`; then commit |
| 4    | Port Jeju into `packages/autonomous` and `packages/app-core` (see checklist above) |
| 5    | `bun install` → `bun run build` → test in UI and chat |

If you tell me where you are (e.g. “I’m at Step 2.2 and git says CONFLICT in X, Y, Z”), I can give you exact commands for those files next.
