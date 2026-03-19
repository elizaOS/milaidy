# Homebrew Distribution

This directory contains Homebrew formula and cask definitions for Milady.

## Files

- `milady.rb` — Formula for the CLI tool (installed via npm)
- `milady.cask.rb` — Cask for the desktop app (DMG installer)

## Setup

### 1. Create Homebrew Tap Repository

Create a new repo: `milady-ai/homebrew-milady`

Structure:
```
homebrew-milady/
├── Formula/
│   └── milady.rb
├── Casks/
│   └── milady.cask.rb
└── README.md
```

### 2. Update SHA256 Hashes

Before publishing, replace placeholder hashes:

**For the cask (DMG files):**
```bash
# Download and hash ARM64 DMG
curl -sL https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.21/Milady-2.0.0-alpha.21-arm64.dmg | shasum -a 256

# Download and hash Intel DMG
curl -sL https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.21/Milady-2.0.0-alpha.21.dmg | shasum -a 256
```

**For the formula (npm tarball):**
```bash
curl -sL https://registry.npmjs.org/miladyai/-/miladyai-2.0.0-alpha.21.tgz | shasum -a 256
```

### 3. Users Can Install

```bash
# Add tap
brew tap milady-ai/milady

# Install desktop app
brew install --cask milady

# Or install CLI only
brew install milady
```

## Auto-Update Workflow

See the publishing guide at `../PUBLISHING_GUIDE.md` for full instructions.

## Testing Locally

```bash
# Test formula syntax
brew audit --strict milady.rb

# Test cask syntax
brew audit --cask --strict milady.cask.rb

# Test installation (from local file)
brew install --formula ./milady.rb
brew install --cask ./milady.cask.rb
```

## Notes

- The cask requires macOS Monterey (12.0) or later
- The formula requires Node.js 22+ (installed as dependency)
- Both support auto-updates via Homebrew's built-in mechanisms
- Desktop app also has built-in auto-update via electron-updater
