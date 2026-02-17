# Homebrew Tap for Milady

This directory contains the Homebrew formula for Milady.

## Setup

To use this formula, you need to create a Homebrew tap repository.
See the publishing guide at `../PUBLISHING_GUIDE.md` for full instructions.

## Quick Test (Local)

```bash
# Test the formula locally before publishing
brew install --build-from-source ./milady.rb

# Or install from the tap once published
brew tap milady-ai/tap
brew install milady
```

## Formula Structure

- `milady.rb` — The Homebrew formula that installs milady from the npm registry

## Updating

When releasing a new version:
1. Update the `url` in `milady.rb` with the new npm tarball URL
2. Update the `sha256` with the hash of the new tarball
3. Push to the `homebrew-tap` repository
