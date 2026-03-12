---
name: Electrobun Platform
description: Cross-platform specifics for Electrobun apps — platform support matrix, Linux/Windows/macOS behavioral differences, CEF requirements by platform, events API, security patterns, CI release matrix, artifact naming, and common pitfalls. Use when targeting multiple platforms, handling platform-specific bugs, setting up CI, or understanding webview differences.
version: 1.0.0
---

# Electrobun Cross-Platform Reference

## Platform Support Matrix

| Platform | OS value | Arch | Status | Default Webview |
|---|---|---|---|---|
| macOS ARM64 | `macos` | `arm64` | Stable | WKWebView |
| macOS Intel | `macos` | `x64` | Stable | WKWebView |
| Windows x64 | `win` | `x64` | Stable | WebView2 (Edge) |
| Windows ARM64 | `win` | `arm64` | Via emulation | Runs x64 binary |
| Linux x64 | `linux` | `x64` | Stable | GTKWebKit |
| Linux ARM64 | `linux` | `arm64` | Stable | GTKWebKit |

Build each platform on its native OS — no cross-compilation.

## Linux — Always Bundle CEF

GTKWebKit has severe limitations:
- **No webview layering** (no overlapping webviews)
- **No masking**
- **No `<electrobun-webview>` compositing**
- **Renderer mixing not supported** — all webviews must use same renderer

For anything beyond a single-webview app on Linux:

```typescript
// electrobun.config.ts
build: {
  linux: { bundleCEF: true, defaultRenderer: 'cef' },
}
```

## Windows — Console Output

Production Windows builds use the GUI subsystem — no console for end users.

```cmd
set ELECTROBUN_CONSOLE=1
.\MyApp.exe
```

Has no effect on macOS or Linux. Dev builds auto-attach a console.

## Webview Hidden/Passthrough Behavior

```typescript
// macOS: hidden and passthrough are INDEPENDENT
webviewSetHidden(webviewId, true);       // hidden, still intercepts clicks
webviewSetPassthrough(webviewId, true);  // separate call for click-through

// Windows & Linux: hidden = hidden + passthrough automatically
webviewSetHidden(webviewId, true);       // hidden AND clicks pass through
// webviewSetPassthrough() is a no-op on Windows/Linux
```

## `<electrobun-webview>` HTML Tag (OOPIF)

Process-isolated "super iframes" — positioned by DOM, rendered natively.
Requires CEF on Linux.

```html
<electrobun-webview
  src="https://example.com"
  width="100%"
  height="400px"
  renderer="cef">
</electrobun-webview>
```

Access from bun: `BrowserView.getAll()` includes OOPIFs.

## CEF Version Override

```typescript
build: {
  cefVersion: '144.0.11+ge135be2+chromium-144.0.7559.97',
}
```

Same major = safe. Adjacent major = usually fine. Distant majors = higher risk.

## Chromium Flags (CEF only)

```typescript
build: {
  mac: {
    bundleCEF: true,
    chromiumFlags: {
      'show-paint-rects': true,
      'user-agent': 'MyApp/1.0',
      'disable-web-security': true,
    },
  },
}
```

## Per-Window Renderer Override

```typescript
// Override defaultRenderer per window
const win = new BrowserWindow({ url: '...', renderer: 'native' });
const cefWin = new BrowserWindow({ url: '...', renderer: 'cef' });
```

Mixing allowed on macOS and Windows. **Not allowed on Linux.**

## Events API

```typescript
import Electrobun from 'electrobun/bun';

// App lifecycle
Electrobun.events.on('before-quit', (e) => {
  if (hasUnsavedChanges()) e.response = { allow: false }; // cancel quit
});
Electrobun.events.on('open-url', (e) => {
  const url = new URL(e.data.url); // macOS URL scheme deep links
});

// Window events (global — all windows)
Electrobun.events.on('close', (e) => { /* e.data.id */ });
Electrobun.events.on('resize', (e) => { /* e.data.id, width, height */ });
Electrobun.events.on('move', (e) => { /* e.data.id, x, y */ });
Electrobun.events.on('blur', (e) => { /* e.data.id */ });
Electrobun.events.on('focus', (e) => { /* e.data.id */ });

// Menu / tray
Electrobun.events.on('application-menu-clicked', (e) => { /* e.data.action */ });
Electrobun.events.on('context-menu-clicked', (e) => { /* e.data.action, data */ });
Electrobun.events.on('tray-menu-clicked', (e) => { /* e.data.action */ });
```

**Quit trigger sources**: dock icon, Cmd+Q, Ctrl+C, SIGTERM, window close, `Utils.quit()`, `process.exit()` — all route through `before-quit`.

**Linux caveat**: system-initiated quit paths (window-manager close, taskbar) may bypass `before-quit`. `Utils.quit()` and `process.exit()` are reliable.

## URL Schemes / Deep Linking

macOS only. App must be in `/Applications` or `~/Applications`.

```typescript
// electrobun.config.ts
app: { urlSchemes: ['myapp', 'myapp-dev'] }

// src/bun/index.ts
Electrobun.events.on('open-url', (e) => {
  const url = new URL(e.data.url);
  if (url.pathname.startsWith('/auth')) { /* handle */ }
});
```

Windows/Linux URL schemes not yet supported.

## Security Checklist

- `sandbox: true` on any BrowserView loading untrusted URLs — disables RPC, events still work
- `setNavigationRules` to allowlist permitted navigation targets; **last match wins**
- Never expose `electrobun/bun` APIs to sandboxed views — route through RPC with validation
- Use separate `partition` values per account for session isolation
- Prefer `views://` over `file://` for local assets

## Code Signing (macOS)

### One-Time Setup
1. Install full **Xcode** from App Store (not CLI tools alone — avoids expired cert issues)
2. Xcode → Settings → Accounts → add Apple ID → Manage Certificates → `+` → **Developer ID Application**
3. Apple Developer Portal: Identifiers → register bundle ID
4. account.apple.com: App Specific Passwords → create one

### Required Env Vars
```bash
export ELECTROBUN_DEVELOPER_ID="My Corp Inc. (BGU899NB8T)"
export ELECTROBUN_TEAMID="BGU899NB8T"
export ELECTROBUN_APPLEID="you@example.com"
export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"
```

Unsigned apps show "damaged and can't be opened" — users fix with:
```bash
xattr -cr /Applications/YourApp.app
```

### Entitlements
```typescript
build: {
  mac: {
    entitlements: {
      'com.apple.security.device.camera': 'Needed for video',
      'com.apple.security.device.microphone': 'Needed for audio',
    }
  }
}
```

## Application Icons

```typescript
build: {
  mac: { icons: 'icon.iconset' },
  // icon.iconset/ must contain icon_{16,32,64,128,256,512}x{same}[@2x].png
  win: { icon: 'icon.iconset/icon_256x256.png' }, // .ico or .png, auto-converted
  linux: { icon: 'icon.iconset/icon_256x256.png' }, // 256x256+ .png
}
```

Reuse PNGs from the macOS iconset for Windows/Linux — no separate files needed.

## Artifact Naming Convention

Artifacts use `{channel}-{os}-{arch}-` prefix. Stable omits the channel. App name spaces stripped.

```
canary-macos-arm64-MyApp-canary.dmg
canary-macos-arm64-MyApp-canary.app.tar.zst
canary-macos-arm64-{prevHash}.patch
canary-win-x64-MyApp-Setup-canary.zip
canary-win-x64-MyApp-canary.tar.zst
canary-linux-x64-MyAppSetup-canary.tar.gz
stable-macos-arm64-MyApp.dmg     ← no "stable" in name on stable channel
```

**Keep old patches on your static host** — users >1 version behind auto-fall back to full `.tar.zst`.

## Release Hosting

Static file host — no server required: S3, Cloudflare R2, GCS, GitHub Releases.

```typescript
release: {
  baseUrl: 'https://storage.googleapis.com/mybucket/myapp/',
  // GitHub Releases:
  // baseUrl: 'https://github.com/ORG/REPO/releases/latest/download',
}
```

**GitHub Releases limitation**: `/releases/latest/download` skips prereleases. Stable works; **canary auto-updates will NOT** — use R2/S3 for canary channel.

## CI Build Matrix (GitHub Actions)

Each platform must build on its own native runner:

```yaml
jobs:
  build-macos-arm64:
    runs-on: macos-14          # Apple Silicon
  build-macos-x64:
    runs-on: macos-13          # Intel
  build-windows:
    runs-on: windows-latest
  build-linux:
    runs-on: ubuntu-latest

# Each job:
#   uses: actions/checkout@v4
#   uses: oven-sh/setup-bun@v2
#   run: bun install
#   run: electrobun build --env=stable
#   uses: softprops/action-gh-release@v1
#     with: files: artifacts/*
```

Tag naming convention: tags containing `-canary` → canary build; all others → stable.

## ASAR Packaging

```typescript
build: {
  useAsar: true,
  asarUnpack: ['*.node', '*.dll', '*.dylib', '*.so', 'data/large/**/*'],
}
```

Packs app resources into `app.asar`. Unpacked files → `app.asar.unpacked/`. Benefits: faster I/O, code obfuscation via randomized temp paths.

## Common Pitfalls

| Issue | Fix |
|---|---|
| Linux webview layering broken | `bundleCEF: true` + `defaultRenderer: 'cef'` |
| Canary auto-update not working | GitHub `/releases/latest` skips prereleases — use R2/S3 |
| "damaged and can't be opened" macOS | Enable `codesign + notarize`, or `xattr -cr` for testing |
| Code signing cert errors | Install full Xcode from App Store, not just CLI tools |
| RPC type mismatch at runtime | Confirm shared type file is imported by both sides |
| Sandbox webview + RPC silent failure | `sandbox: true` disables RPC — use events or remove sandbox |
| Windows no console output | Set `ELECTROBUN_CONSOLE=1` env var |
| URL schemes not registering | App must be in `/Applications`, macOS only |
| Cross-compilation attempt | Each platform must build on its own native OS |
| Linux renderer mixing | All webviews must use the same renderer on Linux |
| Old patches missing | Keep all patch files on static host for sequential upgrades |
| `before-quit` not firing on Linux | System-initiated quits may bypass it; `Utils.quit()` is reliable |
| Notarize + codesign disabled for speed | Turn off during rapid debug cycles, re-enable for release |
