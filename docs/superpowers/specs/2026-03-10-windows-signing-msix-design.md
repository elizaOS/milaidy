# Windows Code Signing & MSIX Store Preparation

**Date:** 2026-03-10
**Issue:** https://github.com/milady-ai/milady/issues/67
**Status:** Approved

## Overview

Set up Windows code signing infrastructure and MSIX package generation for Microsoft Store submission. All changes integrate into the existing `release-electrobun.yml` workflow, mirroring the macOS signing pattern.

## Approach

Option 4: Prepare the full pipeline with placeholder secrets so it's ready to activate once a certificate is obtained. MSIX + Store manifest scaffolding without actual Store submission.

## Components

### 1. Code Signing Pipeline

Integrates into the Windows job in `release-electrobun.yml`, after `electrobun build` and before artifact staging.

**GitHub Secrets (documented, not created):**
- `WINDOWS_SIGN_CERT_BASE64` — Base64-encoded PFX/P12 certificate
- `WINDOWS_SIGN_CERT_PASSWORD` — Certificate password
- `WINDOWS_SIGN_TIMESTAMP_URL` — Timestamp server (default: `http://timestamp.digicert.com`)
- Alternative: `AZURE_SIGN_TENANT_ID`, `AZURE_SIGN_CLIENT_ID`, `AZURE_SIGN_CLIENT_SECRET`

**Signing script** (`apps/app/electrobun/scripts/sign-windows.ps1`):
- Imports PFX certificate to temporary cert store
- Signs `Milady-Setup-canary.exe` and `launcher.exe` inside bundle
- SHA-256 digest + RFC 3161 timestamp
- Graceful fallback: logs warning if secrets aren't configured, doesn't fail build
- Post-signing verification with `signtool verify`

**Conditional execution:** Only runs when `WINDOWS_SIGN_CERT_BASE64` secret is present.

### 2. MSIX Package Generation

**MSIX manifest** (`packaging/msix/AppxManifest.xml`):
- App identity: `MiladyAI.Milady`
- Capabilities: `internetClient`, `privateNetworkClientServer`
- Entry point: Electrobun launcher executable

**Build script** (`packaging/msix/build-msix.ps1`):
- Uses `makeappx.exe` from Windows SDK
- Signs with same certificate
- Produces `Milady-{version}-x64.msix` as release artifact
- Conditional on signing succeeding

### 3. Store Assets Scaffold

```
packaging/msix/
├── AppxManifest.xml
├── build-msix.ps1
├── assets/                   # Placeholder PNGs at required resolutions
├── store/
│   ├── description.md        # Store listing template
│   ├── screenshots/          # Empty with README on sizes
│   └── listing.json          # Partner Center metadata template
└── README.md                 # Full setup guide
```

## Error Handling

- Signing is opt-in via secrets — unsigned builds proceed with warning annotation
- MSIX generation conditional on signing success
- All PowerShell scripts use `$ErrorActionPreference = 'Stop'` with try/catch

## Testing

- `signtool verify /pa /v` in CI post-signing
- `makeappx.exe` validation mode for MSIX
- Smoke test checks signature presence when available
