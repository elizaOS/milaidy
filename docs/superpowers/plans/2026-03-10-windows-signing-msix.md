# Windows Code Signing & MSIX Store Preparation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Windows code signing and MSIX package generation to the Electrobun release pipeline, with graceful fallback when certificates aren't configured.

**Architecture:** Mirrors the macOS signing pattern already in `release-electrobun.yml`. A PowerShell signing script handles certificate import + signtool invocation. A separate MSIX build script produces Store-ready packages. Both are conditional on secrets being present, so unsigned builds continue working.

**Tech Stack:** PowerShell, Windows SDK (signtool.exe, makeappx.exe), GitHub Actions

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/app/electrobun/scripts/sign-windows.ps1` | Create | Import PFX cert, sign executables with signtool, verify signatures |
| `packaging/msix/AppxManifest.xml` | Create | MSIX package manifest with app identity and capabilities |
| `packaging/msix/build-msix.ps1` | Create | Build MSIX package from signed Electrobun output using makeappx |
| `packaging/msix/assets/` | Create | Placeholder Store visual assets at required resolutions |
| `packaging/msix/store/description.md` | Create | Store listing description template |
| `packaging/msix/store/listing.json` | Create | Partner Center metadata template |
| `packaging/msix/store/screenshots/README.md` | Create | Screenshot requirements and guidance |
| `packaging/msix/generate-placeholder-assets.ps1` | Create | Script to generate placeholder PNGs |
| `packaging/msix/README.md` | Create | Setup guide for certificates, Partner Center, Store submission |
| `.github/workflows/release-electrobun.yml` | Modify | Add signing step + MSIX step to Windows job |
| `docs/windows-signing.md` | Create | Documentation for certificate setup and secret configuration |

---

## Chunk 1: Windows Code Signing Script & Workflow Integration

### Task 1: Create the Windows signing script

**Files:**
- Create: `apps/app/electrobun/scripts/sign-windows.ps1`

- [ ] **Step 1: Create sign-windows.ps1**

The script should:
- Accept `-ArtifactsDir` and `-BuildDir` params
- Check for `WINDOWS_SIGN_CERT_BASE64` env var; exit 0 with warning if absent
- Error if `WINDOWS_SIGN_CERT_PASSWORD` is missing when cert is present
- Decode PFX to temp file via `[System.Convert]::FromBase64String`
- Locate `signtool.exe` from Windows SDK (`C:\Program Files (x86)\Windows Kits\10\bin`)
- Define `Sign-Binary` function that runs `signtool sign /f /p /fd sha256 /tr /td sha256 /v` then `signtool verify /pa /v`
- Sign all `*Setup*.exe` in artifacts dir
- Sign all `launcher.exe` in build dir
- Sign any other `.exe` in build dir
- Clean up temp PFX file
- Default timestamp URL: `http://timestamp.digicert.com`

- [ ] **Step 2: Commit**

```
git add apps/app/electrobun/scripts/sign-windows.ps1
git commit -m "feat: add Windows code signing script"
```

### Task 2: Integrate signing into release workflow

**Files:**
- Modify: `.github/workflows/release-electrobun.yml` (after "Stage Windows setup executables" step, before "Verify macOS signature")

- [ ] **Step 3: Add signing step**

Insert after "Stage Windows setup executables":

```yaml
      - name: Sign Windows executables
        if: matrix.platform.os == 'windows'
        env:
          WINDOWS_SIGN_CERT_BASE64: ${{ secrets.WINDOWS_SIGN_CERT_BASE64 }}
          WINDOWS_SIGN_CERT_PASSWORD: ${{ secrets.WINDOWS_SIGN_CERT_PASSWORD }}
          WINDOWS_SIGN_TIMESTAMP_URL: ${{ secrets.WINDOWS_SIGN_TIMESTAMP_URL }}
        run: pwsh -File apps/app/electrobun/scripts/sign-windows.ps1 -ArtifactsDir (Join-Path $PWD "apps/app/electrobun/artifacts") -BuildDir (Join-Path $PWD "apps/app/electrobun/build")
```

- [ ] **Step 4: Add verification step**

Insert after signing:

```yaml
      - name: Verify Windows code signature
        if: matrix.platform.os == 'windows' && env.WINDOWS_SIGN_CERT_BASE64 != ''
        env:
          WINDOWS_SIGN_CERT_BASE64: ${{ secrets.WINDOWS_SIGN_CERT_BASE64 }}
        shell: pwsh
        run: |
          # Find signtool, verify all .exe in artifacts, report count
```

- [ ] **Step 5: Add MSIX to artifact upload patterns**

In "Upload build artifacts" step, add `*.msix` to path list.
In "Collect public release files" step in the release job, add `-name "*.msix"`.

- [ ] **Step 6: Commit**

```
git add .github/workflows/release-electrobun.yml
git commit -m "feat: integrate Windows code signing into release pipeline"
```

---

## Chunk 2: MSIX Package Generation

### Task 3: Create MSIX manifest

**Files:**
- Create: `packaging/msix/AppxManifest.xml`

- [ ] **Step 7: Create AppxManifest.xml**

Key fields:
- Identity: `Name="MiladyAI.Milady"`, `Publisher="CN=Milady AI"`, `Version="0.0.0.0"` (injected at build time), `ProcessorArchitecture="x64"`
- Properties: DisplayName "Milady", Logo "assets\StoreLogo.png"
- TargetDeviceFamily: Windows.Desktop, MinVersion 10.0.17763.0
- Application: Executable="launcher.exe", EntryPoint="Windows.FullTrustApplication"
- VisualElements with Square150x150Logo, Square44x44Logo, Wide310x150Logo, LargeTile
- Protocol extension for "milady" URL scheme
- Capabilities: internetClient, runFullTrust (restricted)

- [ ] **Step 8: Commit**

```
git add packaging/msix/AppxManifest.xml
git commit -m "feat: add MSIX AppxManifest for Microsoft Store"
```

### Task 4: Create MSIX build script

**Files:**
- Create: `packaging/msix/build-msix.ps1`

- [ ] **Step 9: Create build-msix.ps1**

The script should:
- Accept `-BuildDir`, `-OutputDir`, `-Version` params (all mandatory)
- Skip with warning if `WINDOWS_SIGN_CERT_BASE64` not set
- Locate Windows SDK tools (makeappx.exe, signtool.exe)
- Find `launcher.exe` in BuildDir
- Create MSIX staging dir in `$env:RUNNER_TEMP`
- Copy app contents + MSIX assets to staging
- Process AppxManifest.xml: convert semver (2.0.0-alpha.84) to quad version (2.0.84.0)
- Run `makeappx pack /d staging /p output.msix /o`
- Sign MSIX with same PFX certificate
- Verify MSIX signature
- Clean up temp files

- [ ] **Step 10: Commit**

```
git add packaging/msix/build-msix.ps1
git commit -m "feat: add MSIX build script for Microsoft Store packages"
```

### Task 5: Add MSIX build step to release workflow

**Files:**
- Modify: `.github/workflows/release-electrobun.yml`

- [ ] **Step 11: Add MSIX generation step after signing verification**

```yaml
      - name: Build MSIX package
        if: matrix.platform.os == 'windows'
        env:
          WINDOWS_SIGN_CERT_BASE64: ${{ secrets.WINDOWS_SIGN_CERT_BASE64 }}
          WINDOWS_SIGN_CERT_PASSWORD: ${{ secrets.WINDOWS_SIGN_CERT_PASSWORD }}
          WINDOWS_SIGN_TIMESTAMP_URL: ${{ secrets.WINDOWS_SIGN_TIMESTAMP_URL }}
        run: |
          pwsh -File packaging/msix/build-msix.ps1 -BuildDir (Join-Path $PWD "apps/app/electrobun/build") -OutputDir (Join-Path $PWD "apps/app/electrobun/artifacts") -Version "${{ needs.prepare.outputs.version }}"
```

- [ ] **Step 12: Commit**

```
git add .github/workflows/release-electrobun.yml
git commit -m "feat: add MSIX generation step to release pipeline"
```

---

## Chunk 3: Store Assets & Documentation

### Task 6: Create placeholder Store visual assets

**Files:**
- Create: `packaging/msix/generate-placeholder-assets.ps1`
- Create: `packaging/msix/assets/` (5 placeholder PNGs)

- [ ] **Step 13: Create generate-placeholder-assets.ps1**

Script uses `System.Drawing` to generate placeholder PNGs with dark purple (#1a1a2e) background and white "M" letter at these sizes:
- StoreLogo.png (50x50)
- Square44x44Logo.png (44x44)
- Square150x150Logo.png (150x150)
- Wide310x150Logo.png (310x150)
- LargeTile.png (310x310)

- [ ] **Step 14: Run the script to generate assets, or create minimal valid PNGs**

- [ ] **Step 15: Commit**

```
git add packaging/msix/assets/ packaging/msix/generate-placeholder-assets.ps1
git commit -m "feat: add placeholder MSIX Store visual assets"
```

### Task 7: Create Store listing scaffold

**Files:**
- Create: `packaging/msix/store/description.md`
- Create: `packaging/msix/store/listing.json`
- Create: `packaging/msix/store/screenshots/README.md`

- [ ] **Step 16: Create description.md** — Store listing text with short description (100 chars), full description, keywords, category (Productivity), age rating (12+)

- [ ] **Step 17: Create listing.json** — Partner Center metadata template with identity, listing details, screenshot placeholders, pricing (free)

- [ ] **Step 18: Create screenshots/README.md** — Requirements (1366x768 or 2560x1440, PNG/JPEG, 1-10 screenshots) and suggested screenshots list

- [ ] **Step 19: Commit**

```
git add packaging/msix/store/
git commit -m "feat: add Microsoft Store listing scaffold"
```

### Task 8: Create documentation

**Files:**
- Create: `packaging/msix/README.md`
- Create: `docs/windows-signing.md`

- [ ] **Step 20: Create packaging/msix/README.md**

Covers: file overview, prerequisites (cert, SDK, Partner Center), local build commands, CI pipeline description, Store submission steps, publisher identity update instructions.

- [ ] **Step 21: Create docs/windows-signing.md**

Covers: certificate options (Standard/EV OV, Azure Trusted Signing), GitHub secrets setup table, how the pipeline works, SmartScreen notes (EV=immediate trust, OV=gradual), certificate renewal process, local testing commands.

- [ ] **Step 22: Commit**

```
git add packaging/msix/README.md docs/windows-signing.md
git commit -m "docs: add Windows code signing and MSIX setup documentation"
```
