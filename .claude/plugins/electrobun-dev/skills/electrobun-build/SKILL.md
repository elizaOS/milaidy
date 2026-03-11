---
name: Electrobun Build
description: Use when building an Electrobun app for distribution, setting up code signing, understanding platform-specific build requirements, or diagnosing build failures. Covers dev/canary/stable environments, all three platforms, toolchain prerequisites, artifact output, and CI/CD setup.
version: 2.0.0
---

# Electrobun Build

Builds a distributable app bundle and installer for the current platform using `electrobun build`.

## Build Environments

| Environment | Command | Codesign | Updates | Patch gen |
|-------------|---------|----------|---------|-----------|
| `dev` | `electrobun dev` | No | Disabled | No |
| `canary` | `electrobun build --env=canary` | Yes (if configured) | Enabled | Yes |
| `stable` | `electrobun build --env=stable` | Yes (if configured) | Enabled | Yes |

`ELECTROBUN_BUILD_ENV` is set automatically by the CLI and passed to `postBuild` scripts — you do not set it manually.

---

## Platform Prerequisites

### macOS (Intel + Apple Silicon)

```bash
xcode-select --install   # Xcode Command Line Tools
brew install cmake
```

**Produces:** `.dmg` installer + `.app.tar.zst` update tarball
**Toolchain:** `clang++` + `make` + `install_name_tool` (all from Xcode CLT)
**Architectures:** `arm64` (Apple Silicon), `x64` (Intel) — build runs on matching host

### Windows

- **Visual Studio 2022** with component `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`
- **cmake** (available via VS installer or standalone)

The CLI uses `vswhere.exe` to find VS and `vcvarsall.bat` to configure the environment automatically.

**Produces:** `.exe` self-extracting installer (in a `.zip`) + `.tar.zst` update tarball
**Toolchain:** `cl.exe` + `link.exe` via MSVC
**Architecture:** `x64` only

### Linux

```bash
sudo apt-get install -y \
  build-essential \
  cmake \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  fuse \
  libfuse2
```

`libfuse2` is required for AppImage creation.

**Produces:** `.AppImage` + `.tar.zst` update tarball
**Toolchain:** `g++` + `make` + `pkg-config`
**Architectures:** `x64`, `arm64`

---

## electrobun.config.ts — Build Options

### General (`build.*`)

```typescript
build: {
  bun: {
    entrypoint: "src/bun/index.ts",  // default
    // + any Bun.build() options (splitting, minify, target, etc.)
  },

  views: {
    // Each key becomes the view's URL scheme: mainview://index.html
    mainview: {
      entrypoint: "src/mainview/index.ts",
      // + any Bun.build() options per view
    },
  },

  copy: {
    // Record<sourcePath, destPathInBuildOutput>
    "src/assets/icon.png": "resources/icon.png",
  },

  buildFolder:    "build",      // default: "build"
  artifactFolder: "artifacts",  // default: "artifacts"
  targets:        "current",    // default: build for host platform

  useAsar:    false,            // default: false — pack assets into ASAR archive
  asarUnpack: ["*.node", "*.dll", "*.dylib", "*.so"],  // always unpacked from ASAR

  cefVersion:  undefined,  // override bundled CEF version
  bunVersion:  undefined,  // override bundled Bun runtime version
  wgpuVersion: undefined,  // override latest electrobun-dawn release

  locales: "*",  // ICU locales to include ("*" = all); Linux/Windows only
}
```

### macOS (`build.mac`)

```typescript
build: {
  mac: {
    bundleCEF:       false,      // bundle CEF instead of WKWebView (~120MB)
    bundleWGPU:      false,      // bundle Dawn for native GPU rendering
    defaultRenderer: "native",   // "native" | "cef"
    codesign:        false,      // enable Apple code signing
    notarize:        false,      // enable notarization (requires codesign: true)
    icons:           undefined,  // path to .iconset folder or .icns file
    chromiumFlags:   {},         // Record<string, string|true> — CEF-only flags
    entitlements:    undefined,  // path to custom entitlements.plist
  }
}
```

### Windows (`build.win`)

```typescript
build: {
  win: {
    bundleCEF:     false,     // CEF is always needed on Windows (no OS webview)
    bundleWGPU:    false,     // bundle Dawn
    icons:         undefined, // path to .ico file
    chromiumFlags: {},        // CEF Chromium flags
  }
}
```

### Linux (`build.linux`)

```typescript
build: {
  linux: {
    bundleCEF:     false,     // bundle CEF instead of GTKWebKit
    bundleWGPU:    false,     // bundle Dawn
    icons:         undefined, // icon file path
    chromiumFlags: {},        // CEF Chromium flags
  }
}
```

> **Linux multi-view note:** GTKWebKit is the default system webview. For apps with multiple views or needing consistent rendering, `bundleCEF: true` is strongly recommended.

---

## Code Signing (macOS)

Code signing runs automatically when `build.mac.codesign: true` and `ELECTROBUN_DEVELOPER_ID` is set. It only runs when `buildEnvironment !== "dev"`, host OS is macOS, and target OS is macOS.

### Signing Order

1. CEF framework internals (if `bundleCEF: true`)
2. CEF helper applications
3. All `.dylib` files and executables inside `MacOS/` recursively
4. The `launcher` executable
5. The entire `.app` bundle
6. The `.dmg` installer

### Required Environment Variables

```bash
export ELECTROBUN_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"

# Notarization (requires codesign: true)
export ELECTROBUN_APPLEID="you@example.com"
export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"  # app-specific password
export ELECTROBUN_TEAMID="ABCDE12345"
```

### Notarization Sequence

1. `.app` bundle zipped
2. `xcrun notarytool submit --wait` — blocks until Apple responds
3. On success: `xcrun stapler staple` attaches ticket to bundle
4. `.dmg` created, then also code-signed and notarized

---

## Artifact Output

All artifacts land in `artifacts/` (or `build.artifactFolder`).

### Naming Convention: `{channel}-{os}-{arch}-{filename}`

| Platform | Installer | Update Tarball | Manifest |
|----------|-----------|---------------|----------|
| macOS stable arm64 | `MyApp.dmg` | `stable-macos-arm64-MyApp.app.tar.zst` | `stable-macos-arm64-update.json` |
| macOS canary arm64 | `MyApp-canary.dmg` | `canary-macos-arm64-MyApp-canary.app.tar.zst` | `canary-macos-arm64-update.json` |
| macOS stable x64 | `MyApp.dmg` | `stable-macos-x64-MyApp.app.tar.zst` | `stable-macos-x64-update.json` |
| Windows stable x64 | `MyApp-Setup.zip` | `stable-win-x64-MyApp.tar.zst` | `stable-win-x64-update.json` |
| Windows canary x64 | `MyApp-Setup-canary.zip` | `canary-win-x64-MyApp-canary.tar.zst` | `canary-win-x64-update.json` |
| Linux stable x64 | `MyApp-Setup.AppImage` | `stable-linux-x64-MyApp.tar.zst` | `stable-linux-x64-update.json` |
| Linux canary arm64 | `MyApp-Setup-canary.AppImage` | `canary-linux-arm64-MyApp-canary.tar.zst` | `canary-linux-arm64-update.json` |

**Patch files:** `{channel}-{os}-{arch}-{fromHash}.patch` (generated if previous tarball available)

### `update.json` Contents

```json
{
  "version":  "1.0.0",
  "hash":     "<sha256-of-uncompressed-tarball>",
  "platform": "macos",
  "arch":     "arm64"
}
```

### `version.json` Inside the App Bundle

```
macOS:   MyApp.app/Contents/Resources/version.json
Windows: MyApp/Resources/version.json
Linux:   MyApp/Resources/version.json
```

```json
{
  "version":    "1.0.0",
  "hash":       "<content-hash>",
  "channel":    "stable",
  "baseUrl":    "https://updates.example.com/",
  "name":       "MyApp",
  "identifier": "com.example.myapp"
}
```

---

## Environment Variables Reference

### Set by Electrobun CLI — passed to `postBuild` scripts

| Variable | Example |
|----------|---------|
| `ELECTROBUN_BUILD_ENV` | `"dev"` / `"canary"` / `"stable"` |
| `ELECTROBUN_OS` | `"macos"` / `"win"` / `"linux"` |
| `ELECTROBUN_ARCH` | `"arm64"` / `"x64"` |
| `ELECTROBUN_BUILD_DIR` | `/abs/path/to/build/` |
| `ELECTROBUN_APP_NAME` | `"MyApp"` |
| `ELECTROBUN_APP_VERSION` | `"1.0.0"` |
| `ELECTROBUN_APP_IDENTIFIER` | `"com.example.myapp"` |
| `ELECTROBUN_ARTIFACT_DIR` | `/abs/path/to/artifacts/` |

### Set by you — version and runtime overrides

| Variable | Purpose |
|----------|---------|
| `ELECTROBUN_CEF_VERSION` | Override CEF version without editing config |
| `ELECTROBUN_BUN_VERSION` | Override Bun runtime version |
| `ELECTROBUN_CONSOLE=1` | Force console output on Windows in production |

> **`ELECTROBUN_SKIP_CODESIGN` does not exist.** Code signing is controlled by `config.build.mac.codesign` and `buildEnvironment`.

---

## GitHub Actions CI/CD Matrix

Official runners used by Electrobun's own release workflow:

```yaml
strategy:
  matrix:
    include:
      - runner: macos-14           # Apple Silicon
        arch: arm64
      - runner: macos-15-intel     # Intel
        arch: x64
      - runner: ubuntu-24.04       # Linux x64
        arch: x64
      - runner: ubuntu-24.04-arm   # Linux ARM64
        arch: arm64
      - runner: windows-2025       # Windows x64
        arch: x64
```

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 certificate |
| `MACOS_CERTIFICATE_PWD` | Certificate password |
| `ELECTROBUN_DEVELOPER_ID` | Apple Developer ID string |
| `ELECTROBUN_APPLEID` | Apple ID email |
| `ELECTROBUN_APPLEIDPASS` | App-specific password |
| `ELECTROBUN_TEAMID` | Apple Team ID |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET` | R2 bucket name |
| `NODE_AUTH_TOKEN` | npm publish token |

### macOS Certificate Import Step

```yaml
- name: Install Apple Certificate
  run: |
    echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12
    security create-keychain -p "" build.keychain
    security import certificate.p12 -k build.keychain \
      -P $MACOS_CERTIFICATE_PWD -T /usr/bin/codesign
    security list-keychains -d user -s build.keychain
    security set-keychain-settings -t 3600 -u build.keychain
    security unlock-keychain -p "" build.keychain
```

---

## Common Build Failures

| Error | Cause | Fix |
|-------|-------|-----|
| View URL not found | Config key doesn't match `src/` dir name | `views: { mainview: ... }` → URL must be `mainview://index.html` |
| Blank window | Script tag points to `.ts` not compiled `.js` | Use `index.js` in HTML |
| Codesign fails locally | Certificate not in keychain | Run `security find-identity -v -p codesigning` |
| Notarization fails | Hardened runtime without JIT entitlement | Add `com.apple.security.cs.allow-jit` to entitlements.plist |
| Linux AppImage won't run | FUSE missing | `apt-get install fuse libfuse2` |
| Windows MSVC not found | VS component missing | Install `VC.Tools.x86.x64` component via VS Installer |
| CEF build fails | cmake not installed | Install cmake for the platform |
| `libwebgpu_dawn.dylib` not found | `bundleWGPU` not set | Set `build.mac.bundleWGPU: true` in config |
| WGPU GC crash after frames | FFI objects not pinned | Push all GPU objects to `KEEPALIVE` array |
