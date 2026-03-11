---
name: Electrobun Release
description: Use when distributing Electrobun apps, configuring auto-updates, uploading artifacts, understanding update channels, or integrating the Updater API. Covers artifact naming, update.json format, bsdiff patch generation, upload targets, and the full Updater lifecycle.
version: 2.0.0
---

# Electrobun Release

Publishing an Electrobun app means hosting a static set of artifacts and pointing the app's `baseUrl` at them. The Updater polls `update.json`, downloads the tarball or a binary patch, and replaces the running app.

---

## Release Channels

| Channel | Built with | Updates | Codesign |
|---------|-----------|---------|---------|
| `stable` | `--env=stable` | Yes | Required |
| `canary` | `--env=canary` | Yes | Required |
| `dev` | `electrobun dev` | Disabled | Skipped |

Each channel is independent: a user can have `MyApp` (stable) and `MyApp-canary` (canary) installed side-by-side. App data lives in separate directories per channel:

- macOS: `~/Library/Application Support/{identifier}/{channel}/`
- Windows: `%LOCALAPPDATA%/{identifier}/{channel}/`
- Linux: `~/.local/share/{identifier}/{channel}/`

---

## Configuration

```typescript
// electrobun.config.ts
export default defineConfig({
  release: {
    baseUrl:       "https://updates.example.com/",  // required for updates
    generatePatch: true,                             // default: true
  }
});
```

`baseUrl` is embedded in `version.json` at build time. The Updater reads it at runtime to construct all update URLs. Without `baseUrl`, updates are silently disabled.

---

## Artifact Naming

All remote artifacts follow `{channel}-{os}-{arch}-{filename}`.

OS strings: `macos` / `win` / `linux`

### Update Manifest

```
{channel}-{os}-{arch}-update.json

Examples:
  stable-macos-arm64-update.json
  stable-macos-x64-update.json
  stable-win-x64-update.json
  stable-linux-x64-update.json
  canary-macos-arm64-update.json
  canary-linux-arm64-update.json
```

Contents:
```json
{
  "version":  "1.2.0",
  "hash":     "<sha256-of-uncompressed-tarball>",
  "platform": "macos",
  "arch":     "arm64"
}
```

### App Tarballs

```
macOS:        {channel}-{os}-{arch}-{AppName}[-{channel}].app.tar.zst
Windows/Linux: {channel}-{os}-{arch}-{AppName}[-{channel}].tar.zst

Stable examples (no channel suffix in app name):
  stable-macos-arm64-MyApp.app.tar.zst
  stable-macos-x64-MyApp.app.tar.zst
  stable-win-x64-MyApp.tar.zst
  stable-linux-x64-MyApp.tar.zst
  stable-linux-arm64-MyApp.tar.zst

Canary examples (channel suffix in app name):
  canary-macos-arm64-MyApp-canary.app.tar.zst
  canary-win-x64-MyApp-canary.tar.zst
```

### Patch Files

```
{channel}-{os}-{arch}-{fromHash}.patch

Example:
  stable-macos-arm64-abc123def456.patch
```

Patches are generated via `bsdiff` when a previous `update.json` and tarball are available from `baseUrl` at build time. If patch generation fails, the full tarball is the fallback.

### Installers (for first install, not updates)

| Platform | Stable | Canary |
|----------|--------|--------|
| macOS | `MyApp.dmg` | `MyApp-canary.dmg` |
| Windows | `MyApp-Setup.zip` (contains `MyApp-Setup.exe`) | `MyApp-Setup-canary.zip` |
| Linux | `MyApp-Setup.AppImage` | `MyApp-Setup-canary.AppImage` |

---

## Update Server URLs

The Updater constructs all URLs as:
```
{baseUrl}/{artifact-filename}
```

For a `stable` build at `https://updates.example.com/`:

| URL | Purpose |
|-----|---------|
| `https://updates.example.com/stable-macos-arm64-update.json` | Version check |
| `https://updates.example.com/stable-macos-arm64-MyApp.app.tar.zst` | Full download |
| `https://updates.example.com/stable-macos-arm64-abc123.patch` | Incremental patch |

This flat URL scheme works with any static file host: Cloudflare R2, AWS S3, GitHub Releases, or plain nginx.

---

## Updater API

```typescript
import { Updater } from "electrobun/bun";

// 1. Check for update
const status = await Updater.checkForUpdate();
// status: "checking" | "update-available" | "no-update" | "error"

// 2. Download update (tries patch first, falls back to full tarball)
await Updater.downloadUpdate();
// status: "downloading" → "update-ready"

// 3. Apply update (replaces bundle, relaunches)
await Updater.applyUpdate();

// Read current app info
const info = await Updater.getLocalInfo();
// { version, hash, channel, baseUrl, name, identifier }

// Read update info (available version)
const update = await Updater.updateInfo();

// Track status changes
Updater.onStatusChange((status) => {
  console.log("Updater status:", status);
});

// Granular history
const history = await Updater.getStatusHistory();
await Updater.clearStatusHistory();
```

### Status Values

| Status | Meaning |
|--------|---------|
| `checking` | Fetching `update.json` |
| `update-available` | Remote hash differs from local hash |
| `no-update` | Hashes match — already current |
| `downloading` | Downloading patch or tarball |
| `update-ready` | Download complete and verified |
| `error` | Any step failed |

### How Version Checking Works

1. Fetches `{baseUrl}/{channel}-{os}-{arch}-update.json`
2. Compares remote `hash` to local `hash` in `Resources/version.json`
3. If hashes differ → `update-available`
4. If identical → `no-update`

Hash is SHA-256 of the **uncompressed** tarball contents.

---

## Download Strategy

1. **Try patch first:** fetch `{channel}-{os}-{arch}-{currentHash}.patch`
2. Apply patch via `bspatch` to the local cached tarball
3. **If patch missing or fails:** download full `.tar.zst` tarball
4. Decompress with `zig-zstd`

Local cache directory (intermediate files during update):
```
macOS:   ~/Library/Application Support/{id}/{channel}/self-extraction/
Windows: %LOCALAPPDATA%/{id}/{channel}/self-extraction/
Linux:   ~/.local/share/{id}/{channel}/self-extraction/
```

Contains: current tarball, next tarball, temp patch, compressed bundles.

---

## Apply Update — Platform Specifics

| Platform | Method |
|----------|--------|
| macOS | Removes quarantine attribute, replaces `.app` bundle, relaunches |
| Windows | Helper script handles file locking before replacing `.exe` |
| Linux | Replaces `.AppImage` or extracted directory, relaunches |

---

## Uploading Artifacts

### Cloudflare R2 (recommended)

```bash
# Using wrangler
wrangler r2 object put mybucket/stable-macos-arm64-update.json \
  --file artifacts/stable-macos-arm64-update.json

# Using AWS CLI (R2 is S3-compatible)
aws s3 cp artifacts/ s3://mybucket/ \
  --recursive \
  --endpoint-url https://<accountid>.r2.cloudflarestorage.com
```

### AWS S3

```bash
aws s3 cp artifacts/ s3://mybucket/releases/ --recursive
```

### rsync to nginx / CDN origin

```bash
rsync -avz artifacts/ user@server:/var/www/updates/
```

### GitHub Releases (simple, free)

Upload artifacts as release assets. Set `baseUrl` to the GitHub Releases download URL:
```
https://github.com/{owner}/{repo}/releases/download/{tag}/
```

Note: GitHub Releases don't support patch files efficiently (they're all separate assets). Use a CDN if patch generation is important.

---

## Release Checklist

Before every release:

```
[ ] Bump version in electrobun.config.ts
[ ] Set release.baseUrl pointing to your static host
[ ] Confirm build.mac.codesign + notarize: true (macOS)
[ ] Confirm ELECTROBUN_DEVELOPER_ID is set in CI
[ ] Confirm ELECTROBUN_APPLEID / APPLEIDPASS / TEAMID are in CI secrets
[ ] Build: electrobun build --env=stable (or canary)
[ ] Verify artifacts/ contains:
    - {channel}-{os}-{arch}-update.json  (for each platform)
    - {channel}-{os}-{arch}-{AppName}.{ext}.tar.zst (for each platform)
    - {channel}-{os}-{arch}-{hash}.patch (if previous version published)
    - Installer files (DMG / ZIP / AppImage)
[ ] Upload all artifacts/ files to baseUrl host
[ ] Verify: curl https://updates.example.com/stable-macos-arm64-update.json
[ ] Tag the release in git
```

---

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| `baseUrl` missing or wrong | Updates silently never trigger | Set `release.baseUrl` + verify with curl |
| Uploaded to wrong path | 404 on update check | Artifacts must be at root of `baseUrl`, flat — no subdirectories |
| Skipped codesign | macOS users get "damaged app" | Set `codesign: true` + provide signing env vars |
| Skipped notarize | Gatekeeper blocks on first launch | Set `notarize: true` — required for distribution |
| Wrong OS string in filename | Update fails silently | OS is `macos` / `win` / `linux` — not `darwin` / `windows` |
| Patch generated before new tarball uploaded | Patch references tarball that doesn't exist | Upload tarballs before running `checkForUpdate` |
| `release.baseUrl` has no trailing slash | URL construction breaks | Always end `baseUrl` with `/` |
