---
name: electrobun-align
description: Alignment wizard for existing Electrobun projects. Scans the repo, audits against plugin standards and Electrobun best practices, backs up files before touching them, prompts for each change with Y/N/skip, then applies. Safe to run at any time — never modifies without permission.
argument-hint: [--force-backup] [--audit-only]
---

Align an existing Electrobun project with plugin standards. Non-destructive audit first, then prompted changes with backup.

## Flags

- `--audit-only` — scan and report only, make no changes
- `--force-backup` — back up ALL files before touching (default: backs up only files it will modify)

---

## Phase 1: Non-Destructive Scan

Read these files silently — no changes yet:

```bash
# Project structure
ls -la
ls src/ 2>/dev/null
ls .github/ 2>/dev/null
ls .github/workflows/ 2>/dev/null

# Core config files
cat electrobun.config.ts 2>/dev/null
cat package.json 2>/dev/null
cat tsconfig.json 2>/dev/null
cat CLAUDE.md 2>/dev/null
cat .gitignore 2>/dev/null
cat vitest.config.ts 2>/dev/null
cat biome.json 2>/dev/null || cat .biome.json 2>/dev/null

# CI workflows
ls .github/workflows/ 2>/dev/null
```

Extract from `electrobun.config.ts`:
- `app.name`, `app.identifier`, `app.version`
- `release.baseUrl` (present or missing?)
- `build.mac.codesign`, `build.mac.notarize`
- `build.mac.bundleWGPU`, `build.mac.bundleCEF`
- Each key in `build.views` → list of view names

Detect template type from directory structure (same classification as `/electrobun-setup`).

Announce:
> Scanning project: **<app.name>** | Template: **<type>** | Identifier: **<identifier>**
> Auditing against electrobun-dev plugin standards...

---

## Phase 2: Audit Checklist

Run through every check below. Classify each as:
- ✅ **OK** — already correct
- ⚠️ **DRIFT** — present but incorrect or stale
- ❌ **MISSING** — not present, should be added

### Audit Group A: Config Integrity

| Check | What to verify |
|-------|---------------|
| `app.name` | Present and non-empty |
| `app.identifier` | Reverse DNS format `com.example.app` |
| `app.version` | Valid semver |
| `build.views` | Each key matches a `src/<viewname>/` directory exactly |
| `release.baseUrl` | Present and ends with `/` for canary/stable builds |
| `release.baseUrl` trailing slash | URL must end with `/` |
| `build.copy` | Is a `Record<string,string>` (object), not an array |
| `build.mac.icons` | Uses `icons` (with 's'), not `icon` |
| GPU bundling | If GPU code found in src/: `bundleWGPU: true` set per platform |
| CEF bundling | If multi-view/CEF: `bundleCEF: true` set per platform |

### Audit Group B: View/URL Alignment

For each entry in `build.views`:
- Check that `src/<viewname>/` directory exists
- Check that `src/<viewname>/index.html` exists
- Check that any `BrowserWindow({ url: ... })` in `src/bun/index.ts` uses `<viewname>://index.html` exactly matching the config key

Flag any mismatch as DRIFT.

### Audit Group C: RPC Patterns

Scan `src/bun/` for `new BrowserView`:
- Each BrowserView that has `rpc:` must have `sandbox: false`
- `openDevTools()` must be called on the BrowserView instance, not `win.webview.openDevTools()`

Scan `src/<viewname>/` for `new Electroview`:
- `new Electroview({ rpc: ... })` must be called before any `rpc.request.*` or `rpc.send.*`
- Import must be from `electrobun/view`, not `electrobun/bun`

Scan `src/bun/` imports:
- Bun-side files must import from `electrobun/bun`, not `electrobun/view`

### Audit Group D: Event Names

Scan all event listeners for deprecated/wrong names:
- `'menu-clicked'` → should be `'application-menu-clicked'`
- `'tray-clicked'` → should be `'tray-menu-clicked'`
- `'context-clicked'` → should be `'context-menu-clicked'`

### Audit Group E: GPU Safety (if GPU code present)

- Scan for `device.create*` calls — each one should be followed by `KEEPALIVE.push(...)`
- `KEEPALIVE` array should be declared at module scope
- Swap chain `context.configure()` should be called on resize events

### Audit Group F: Project Files

| Check | File | Status |
|-------|------|--------|
| Gitignore covers build output | `.gitignore` | Contains `build/`, `artifacts/` |
| CLAUDE.md present | `CLAUDE.md` | Exists with key patterns |
| Shared types directory | `src/shared/` | Directory exists |
| CI workflow | `.github/workflows/ci.yml` | Exists |
| Release workflow | `.github/workflows/release-electrobun.yml` | Exists |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` | Exists |
| Test config | `vitest.config.ts` | Exists with coverage thresholds |
| Test directory | `src/tests/` | Exists |
| Docs scaffold | `docs/mint.json` | Exists (if Mintlify chosen) |

### Audit Group G: Package.json Scripts

Check that `package.json` scripts include:
- `"start"` or equivalent (`electrobun dev`)
- `"dev"` (with `--watch`)
- `"build:canary"` (`electrobun build --env=canary`)
- `"build:stable"` (`electrobun build --env=stable`)
- `"test"` (`vitest run` or `bun test`)
- `"test:coverage"` (with coverage flag)

### Audit Group H: File Size Check

Scan all `.ts` files in `src/`:
- Flag any file over 500 LOC as ⚠️ DRIFT (milady reviewer flags these)

### Audit Group I: Debug Artifacts

Scan all `.ts` files for:
- `console.log(` statements → flag each file that has them
- `TODO` / `FIXME` comments → list files
- `as any` without adjacent comment → flag

---

## Phase 3: Audit Report

Print the full audit report:

```
═══════════════════════════════════════════════════════
 ELECTROBUN ALIGNMENT AUDIT — <app.name>
═══════════════════════════════════════════════════════

Group A: Config Integrity
  ✅ app.name — "MyApp"
  ✅ app.identifier — "com.example.myapp"
  ⚠️  release.baseUrl — missing (updates will not work)
  ❌ src/settings/ — in build.views but directory missing

Group B: View/URL Alignment
  ✅ mainview://index.html matches views.mainview
  ⚠️  BrowserWindow uses "preferences://index.html" but config key is "settings"

Group C: RPC Patterns
  ⚠️  src/bun/index.ts:42 — BrowserView missing sandbox: false
  ✅ Electroview called before rpc usage

Group D: Event Names
  ❌ src/bun/menu.ts:18 — 'menu-clicked' should be 'application-menu-clicked'

Group E: GPU Safety
  N/A (no GPU code detected)

Group F: Project Files
  ✅ .gitignore covers build/
  ❌ .github/workflows/ci.yml — missing
  ❌ .github/workflows/release-electrobun.yml — missing
  ✅ CLAUDE.md present
  ❌ vitest.config.ts — missing
  ❌ src/tests/ — missing

Group G: Package.json Scripts
  ✅ start, dev, build:canary present
  ❌ build:stable — missing
  ❌ test — missing

Group H: File Size
  ✅ All files under 500 LOC

Group I: Debug Artifacts
  ⚠️  src/bun/index.ts — 3 console.log statements
  ⚠️  src/mainview/index.ts — 1 TODO comment

═══════════════════════════════════════════════════════
 SUMMARY
 ✅ OK: 8    ⚠️ DRIFT: 6    ❌ MISSING: 7
 Total issues: 13
═══════════════════════════════════════════════════════
```

If `--audit-only` flag was set, stop here and print:
> Audit complete. No changes made. Run `/electrobun-align` without `--audit-only` to fix issues.

---

## Phase 4: Backup

Before touching any file, create a timestamped backup directory:

```bash
mkdir -p .electrobun-align-backup/$(date +%Y%m%d-%H%M%S)
```

Store the backup path as `BACKUP_DIR`.

For each file that will be modified (not created), copy it to backup:
```bash
cp <file> $BACKUP_DIR/<file-with-slashes-replaced-by-dashes>
```

Announce:
> Backup created at: `.electrobun-align-backup/<timestamp>/`
> Files will be backed up before modification. To restore: copy from this directory.

---

## Phase 5: Prompted Changes

Present each issue one at a time. For each:

```
─────────────────────────────────────────────────────
Issue: [GROUP] <title>
  <description of what's wrong>
  <description of what the fix will do>
  File: <path>

Fix this? [Y/n/skip all in this group/view diff]
```

Options:
- `Y` or Enter → apply fix
- `n` → skip this issue
- `s` → skip all remaining issues in this group
- `d` → show the exact diff that will be applied before deciding
- `q` → quit alignment (keep all changes applied so far)

### Fix Implementations

**Config: missing `release.baseUrl`**
- Ask: "Enter your update server URL (or press Enter to skip):"
- If URL provided: add `release: { baseUrl: "<url>/", generatePatch: true }` to config
- Backup config first

**Config: `build.copy` is array not object**
- Convert `["src/file.txt"]` to `{ "src/file.txt": "file.txt" }`
- Backup config first

**Config: `icon` → `icons` (macOS)**
- Rename field in mac section
- Backup config first

**Config: missing `release.baseUrl` trailing slash**
- Append `/` to existing URL
- Backup config first

**View/URL mismatch**
- Show the mismatch
- Ask: "Rename config key to match directory, or rename directory to match config key?"
- Apply chosen fix

**RPC: missing `sandbox: false`**
- Add `sandbox: false` to the BrowserView constructor options
- Backup file first

**Event name: wrong string**
- Replace `'menu-clicked'` with `'application-menu-clicked'` (etc.)
- Backup file first

**Missing CI workflow**
- Create `.github/workflows/ci.yml` (minimal type-check version)
- No backup needed (new file)

**Missing release workflow**
- Ask: "Which platforms to include? [macOS/Windows/Linux]"
- Create `.github/workflows/release-electrobun.yml`
- No backup needed (new file)

**Missing PR template**
- Create `.github/PULL_REQUEST_TEMPLATE.md`
- No backup needed (new file)

**Missing vitest.config.ts**
- Create with coverage thresholds (25%/15%)
- No backup needed (new file)

**Missing `src/tests/` directory**
- Create directory + index.ts + example.test.ts

**Missing package.json scripts**
- Add only the missing scripts
- Backup package.json first

**Missing CLAUDE.md**
- Create with template appropriate for detected project type

**Missing `src/shared/` directory**
- Create directory + `.gitkeep`

**Debug artifacts (console.log)**
- Show each one: file:line with context
- Ask: "Remove this console.log? [Y/n]"
- Backup file first (once per file)

**File over 500 LOC**
- Report only — cannot auto-fix. Recommend: `Use /electrobun-feature or /electrobun-sdlc to refactor this file`

---

## Phase 6: Alignment Report

After all prompts complete:

```
═══════════════════════════════════════════════════════
 ALIGNMENT COMPLETE — <app.name>
═══════════════════════════════════════════════════════

Applied:
  ✅ Added release.baseUrl to electrobun.config.ts
  ✅ Fixed BrowserView sandbox flag (src/bun/index.ts)
  ✅ Fixed event name: menu-clicked → application-menu-clicked
  ✅ Created .github/workflows/ci.yml
  ✅ Created vitest.config.ts
  ✅ Created src/tests/

Skipped:
  ⏭️  release workflow (user skipped)
  ⏭️  console.log removal (user skipped)

Backed up:
  📁 .electrobun-align-backup/<timestamp>/
     - electrobun.config.ts
     - src/bun/index.ts
     - src/bun/menu.ts

Remaining issues (not fixed):
  ⚠️  src/bun/index.ts — files over 500 LOC (manual refactor needed)
  ⚠️  src/mainview/index.ts — TODO comment (manual review needed)

═══════════════════════════════════════════════════════

To restore any backup file:
  cp .electrobun-align-backup/<timestamp>/<filename> <original-path>

Run /electrobun-workflow to check your current pipeline stage.
Run /electrobun-align again at any time to check for new drift.
```

---

## Safety Rules

1. **Never modify without backup** — every file edit is preceded by a copy to `BACKUP_DIR`
2. **Never auto-apply** — every change requires Y confirmation
3. **Idempotent** — running twice produces the same result (no double-appending)
4. **Non-destructive new files** — if creating a file that already exists with different content, show diff and ask "Replace, merge, or skip?"
5. **Preserves user content** — when adding scripts to `package.json`, only add missing keys, never overwrite existing ones
6. **Config read-before-write** — always read `electrobun.config.ts` in full before editing any field
