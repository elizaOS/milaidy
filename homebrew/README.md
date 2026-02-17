# Homebrew Distribution

This directory contains Homebrew formula and cask definitions for Milaidy.

## Files

- `milaidy.rb` — Formula for the CLI tool (installed via npm)
- `milaidy.cask.rb` — Cask for the desktop app (DMG installer)

## Setup

### 1. Create Homebrew Tap Repository

Create a new repo: `milady-ai/homebrew-milaidy`

Structure:
```
homebrew-milaidy/
├── Formula/
│   └── milaidy.rb
├── Casks/
│   └── milaidy.rb      # renamed from milaidy.cask.rb
└── README.md
```

### 2. Update SHA256 Hashes

Before publishing, replace placeholder hashes:

**For the cask (DMG files):**
```bash
# Download and hash ARM64 DMG
curl -sL https://github.com/milady-ai/milaidy/releases/download/v2.0.0-alpha.21/Milaidy-2.0.0-alpha.21-arm64.dmg | shasum -a 256

# Download and hash Intel DMG
curl -sL https://github.com/milady-ai/milaidy/releases/download/v2.0.0-alpha.21/Milaidy-2.0.0-alpha.21.dmg | shasum -a 256
```

**For the formula (npm tarball):**
```bash
curl -sL https://registry.npmjs.org/milaidy/-/milaidy-2.0.0-alpha.21.tgz | shasum -a 256
```

### 3. Users Can Install

```bash
# Add tap
brew tap milady-ai/milaidy

# Install desktop app
brew install --cask milaidy

# Or install CLI only
brew install milaidy
```

## Auto-Update Workflow

Add this GitHub Action to the main repo to auto-update the tap on release:

```yaml
# .github/workflows/update-homebrew.yml
name: Update Homebrew

on:
  release:
    types: [published]

jobs:
  update-tap:
    runs-on: macos-latest
    steps:
      - name: Update Homebrew formula
        uses: mislav/bump-homebrew-formula-action@v3
        with:
          formula-name: milaidy
          homebrew-tap: milady-ai/homebrew-milaidy
          tag-name: ${{ github.ref_name }}
          download-url: https://registry.npmjs.org/milaidy/-/milaidy-${{ github.ref_name }}.tgz
        env:
          COMMITTER_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

## Testing Locally

```bash
# Test formula syntax
brew audit --strict milaidy.rb

# Test cask syntax
brew audit --cask --strict milaidy.cask.rb

# Test installation (from local file)
brew install --formula ./milaidy.rb
brew install --cask ./milaidy.cask.rb
```

## Notes

- The cask requires macOS Monterey (12.0) or later
- The formula requires Node.js 22+ (installed as dependency)
- Both support auto-updates via Homebrew's built-in mechanisms
- Desktop app also has built-in auto-update via electron-updater
