# Milady — Package Publishing Guide

This guide covers the **human steps** required to publish Milady across all five package managers. The packaging configs are ready — this document walks through account setup, credential configuration, and publishing commands.

---

## Table of Contents

1. [PyPI (milady)](#1-pypi-milady)
2. [Homebrew](#2-homebrew)
3. [apt (Debian/Ubuntu)](#3-apt-debianubuntu)
4. [Snap](#4-snap)
5. [Flatpak](#5-flatpak)
6. [CI/CD Automation](#6-cicd-automation)
7. [Version Bumping Checklist](#7-version-bumping-checklist)

---

## 1. PyPI (milady)

The `milady` package on PyPI is a **dynamic loader** — a thin Python wrapper that auto-installs and delegates to the Node.js milady CLI.

### 1.1 Account Setup (one-time)

1. **Create a PyPI account** at https://pypi.org/account/register/
2. **Enable 2FA** (required for new projects) at https://pypi.org/manage/account/two-factor/
3. **Create an API token**:
   - Go to https://pypi.org/manage/account/token/
   - Scope: "Entire account" (for first upload) or project-scoped after first publish
   - Save the token — it starts with `pypi-`
4. **Configure credentials** locally:

```bash
# Option A: Using a ~/.pypirc file
cat > ~/.pypirc << 'EOF'
[distutils]
index-servers = pypi

[pypi]
username = __token__
password = pypi-YOUR_TOKEN_HERE
EOF
chmod 600 ~/.pypirc
```

```bash
# Option B: Environment variable (better for CI)
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR_TOKEN_HERE
```

### 1.2 Test on TestPyPI First (recommended)

1. Create account at https://test.pypi.org/account/register/
2. Create API token at https://test.pypi.org/manage/account/token/

```bash
cd packaging/pypi

# Install build tools
pip install build twine

# Build the package
python -m build

# Upload to TestPyPI
twine upload --repository testpypi dist/*

# Test installation from TestPyPI
pip install --index-url https://test.pypi.org/simple/ milady
milady --help
```

### 1.3 Publish to PyPI

```bash
cd packaging/pypi

# Build
python -m build

# Upload (uses ~/.pypirc or TWINE env vars)
twine upload dist/*

# Verify
pip install milady
milady --version
```

### 1.4 Reserve the Package Name

If you want to claim the `milady` name immediately before the full release:

```bash
cd packaging/pypi
python -m build
twine upload dist/*
```

The alpha version (`2.0.0a7`) is fine for name reservation.

---

## 2. Homebrew

### 2.1 Create the Tap Repository (one-time)

A Homebrew "tap" is just a GitHub repo with a naming convention.

1. **Create a GitHub repo** named `homebrew-tap` under the `milady-ai` org:
   - URL will be: `https://github.com/milady-ai/homebrew-tap`

2. **Initialize the repo**:

```bash
# Clone and set up
git clone https://github.com/milady-ai/homebrew-tap.git
cd homebrew-tap

# Copy the formula
mkdir -p Formula
cp /path/to/milady/packaging/homebrew/milady.rb Formula/milady.rb
```

3. **Get the SHA256 hash** of the npm tarball:

```bash
# Download the tarball and compute hash
curl -fsSL "https://registry.npmjs.org/miladyai/-/miladyai-2.0.0-alpha.7.tgz" -o milady.tgz
shasum -a 256 milady.tgz
# Replace PLACEHOLDER_SHA256 in milady.rb with the actual hash
```

4. **Push the formula**:

```bash
git add Formula/milady.rb
git commit -m "Add milady formula"
git push origin main
```

### 2.2 Test the Formula

```bash
# Test locally before pushing
brew install --build-from-source Formula/milady.rb

# Or after pushing to the tap repo
brew tap milady-ai/tap
brew install milady
```

### 2.3 Users Install With

```bash
brew tap milady-ai/tap
brew install milady
```

Or one-liner:

```bash
brew install milady-ai/tap/milady
```

### 2.4 Updating for New Releases

```bash
# Compute new SHA256
curl -fsSL "https://registry.npmjs.org/miladyai/-/miladyai-NEW_VERSION.tgz" -o milady.tgz
shasum -a 256 milady.tgz

# Update the formula: change url and sha256
# Push to homebrew-tap repo
```

---

## 3. apt (Debian/Ubuntu)

There are two approaches: a **PPA** (easier, Ubuntu-focused) or a **self-hosted apt repo** (works with all Debian-based distros).

### 3.1 Option A: Launchpad PPA (Ubuntu)

1. **Create a Launchpad account** at https://launchpad.net/+login
2. **Create a GPG key** and upload to Launchpad:

```bash
# Generate a GPG key
gpg --full-generate-key
# Choose RSA, 4096 bits, email matching your Launchpad account

# Upload to keyserver
gpg --send-keys YOUR_KEY_ID

# Add to Launchpad at https://launchpad.net/~/+editpgpkeys
```

3. **Create a PPA**:
   - Go to https://launchpad.net/~/+activate-ppa
   - Name: `milady`
   - Display name: "Milady — Personal AI Assistant"

4. **Build and upload the source package**:

```bash
cd /path/to/milady

# Copy debian/ packaging into place
cp -r packaging/debian .

# Build the source package
dpkg-buildpackage -S -sa -k"YOUR_GPG_KEY_ID"

# Upload to PPA
dput ppa:YOUR_USERNAME/milady ../milady_2.0.0~alpha7-1_source.changes
```

5. **Users install with**:

```bash
sudo add-apt-repository ppa:YOUR_USERNAME/milady
sudo apt update
sudo apt install milady
```

### 3.2 Option B: Self-Hosted apt Repository

This gives you more control and works across all Debian-based distros.

1. **Build the .deb package**:

```bash
cd /path/to/milady
cp -r packaging/debian .

# Install build dependencies
sudo apt install debhelper nodejs npm

# Build the package
dpkg-buildpackage -us -uc -b

# The .deb will be in the parent directory
ls ../milady_*.deb
```

2. **Set up a repo using GitHub Pages or a server**:

```bash
# Create repo structure
mkdir -p apt-repo/pool/main/m/milady
mkdir -p apt-repo/dists/stable/main/binary-amd64

# Copy the .deb
cp ../milady_*.deb apt-repo/pool/main/m/milady/

# Generate Packages index
cd apt-repo
dpkg-scanpackages pool/ /dev/null | gzip -9c > dists/stable/main/binary-amd64/Packages.gz
dpkg-scanpackages pool/ /dev/null > dists/stable/main/binary-amd64/Packages

# Create Release file
cd dists/stable
apt-ftparchive release . > Release

# Sign with GPG
gpg --armor --detach-sign -o Release.gpg Release
gpg --armor --clearsign -o InRelease Release
```

3. **Host the repo** (GitHub Pages, S3, Cloudflare R2, etc.)

4. **Users install with**:

```bash
# Add the GPG key
curl -fsSL https://apt.milady.ai/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/milady.gpg

# Add the repo
echo "deb [signed-by=/usr/share/keyrings/milady.gpg] https://apt.milady.ai stable main" | \
  sudo tee /etc/apt/sources.list.d/milady.list

sudo apt update
sudo apt install milady
```

---

## 4. Snap

### 4.1 Account Setup (one-time)

1. **Create a Snapcraft account** at https://snapcraft.io/account
   - Uses Ubuntu One SSO
2. **Install snapcraft**:

```bash
sudo snap install snapcraft --classic
```

3. **Login**:

```bash
snapcraft login
```

4. **Register the snap name**:

```bash
snapcraft register milady
```

### 4.2 Build the Snap

```bash
cd /path/to/milady

# Copy snapcraft.yaml into place
mkdir -p snap
cp packaging/snap/snapcraft.yaml snap/

# Build the snap (requires LXD or Multipass)
snapcraft

# This produces: milady_2.0.0-alpha.7_amd64.snap
```

### 4.3 Test Locally

```bash
# Install the local snap
sudo snap install milady_*.snap --classic --dangerous

# Test
milady --version
milady --help
```

### 4.4 Publish to Snap Store

```bash
# Upload to edge channel first
snapcraft upload milady_*.snap --release=edge

# After testing, promote to stable
snapcraft release milady <revision> stable
```

### 4.5 Users Install With

```bash
sudo snap install milady --classic
```

---

## 5. Flatpak

### 5.1 Setup (one-time)

1. **Install Flatpak build tools**:

```bash
# Debian/Ubuntu
sudo apt install flatpak flatpak-builder

# Fedora
sudo dnf install flatpak flatpak-builder
```

2. **Install the SDK**:

```bash
flatpak install flathub org.freedesktop.Platform//23.08
flatpak install flathub org.freedesktop.Sdk//23.08
```

3. **Create a Flathub account** (for Flathub distribution):
   - Submit at https://github.com/flathub/flathub/issues/new
   - Or self-host a Flatpak repo

### 5.2 Update SHA256 Hashes

Before building, you need the actual SHA256 hashes for the Node.js binaries:

```bash
# x86_64
curl -fsSL "https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz" -o node-x64.tar.xz
shasum -a 256 node-x64.tar.xz
# Replace PLACEHOLDER_SHA256_X64 in the manifest

# ARM64
curl -fsSL "https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-arm64.tar.xz" -o node-arm64.tar.xz
shasum -a 256 node-arm64.tar.xz
# Replace PLACEHOLDER_SHA256_ARM64 in the manifest
```

### 5.3 Build the Flatpak

```bash
cd packaging/flatpak

# Build
flatpak-builder --repo=repo build-dir ai.milady.Milady.yml

# Create a bundle for testing
flatpak build-bundle repo milady.flatpak ai.milady.Milady
```

### 5.4 Test Locally

```bash
# Install from local bundle
flatpak --user install milady.flatpak

# Run
flatpak run ai.milady.Milady --version
flatpak run ai.milady.Milady start
```

### 5.5 Publish to Flathub

1. Fork https://github.com/flathub/flathub
2. Create a new repo: `github.com/flathub/ai.milady.Milady`
3. Add the manifest and supporting files
4. Submit a PR — Flathub maintainers will review

### 5.6 Users Install With

```bash
flatpak install flathub ai.milady.Milady
flatpak run ai.milady.Milady start
```

---

## 6. CI/CD Automation

### GitHub Actions Workflow

Add this to `.github/workflows/publish-packages.yml` to automate publishing across all platforms:

```yaml
name: Publish Packages

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish'
        required: true

jobs:
  # ── PyPI ─────────────────────────────────────────────────────────────
  publish-pypi:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # For trusted publishing
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Build package
        working-directory: packaging/pypi
        run: |
          pip install build
          python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: packaging/pypi/dist/

  # ── Snap ─────────────────────────────────────────────────────────────
  publish-snap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup snap
        run: |
          mkdir -p snap
          cp packaging/snap/snapcraft.yaml snap/
      - uses: snapcore/action-build@v1
        id: snapcraft
      - uses: snapcore/action-publish@v1
        env:
          SNAPCRAFT_STORE_CREDENTIALS: ${{ secrets.SNAP_TOKEN }}
        with:
          snap: ${{ steps.snapcraft.outputs.snap }}
          release: edge

  # ── Homebrew ─────────────────────────────────────────────────────────
  update-homebrew:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Update Homebrew formula
        env:
          HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
        run: |
          VERSION="${{ github.event.release.tag_name || github.event.inputs.version }}"
          VERSION="${VERSION#v}"
          URL="https://registry.npmjs.org/miladyai/-/miladyai-${VERSION}.tgz"
          SHA256=$(curl -fsSL "$URL" | shasum -a 256 | cut -d' ' -f1)

          git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/milady-ai/homebrew-tap.git"
          cd homebrew-tap

          sed -i "s|url \".*\"|url \"${URL}\"|" Formula/milady.rb
          sed -i "s|sha256 \".*\"|sha256 \"${SHA256}\"|" Formula/milady.rb
          sed -i "s|version \".*\"|version \"${VERSION}\"|" Formula/milady.rb

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Formula/milady.rb
          git commit -m "Update milady to ${VERSION}"
          git push
```

### Required GitHub Secrets

| Secret | Where to get it | Used by |
|---|---|---|
| `SNAP_TOKEN` | `snapcraft export-login --snaps=milady --acls=package_push -` | Snap publishing |
| `HOMEBREW_TAP_TOKEN` | GitHub PAT with `repo` scope for `milady-ai/homebrew-tap` | Homebrew formula updates |
| `PYPI_API_TOKEN` | https://pypi.org/manage/account/token/ (or use trusted publishing) | PyPI uploads |

### PyPI Trusted Publishing (recommended)

Instead of API tokens, use OIDC trusted publishing:
1. Go to https://pypi.org/manage/project/milady/settings/publishing/
2. Add a "GitHub Actions" publisher:
   - Owner: `milady-ai`
   - Repository: `milady`
   - Workflow: `publish-packages.yml`
   - Environment: (leave blank or set one)

This eliminates the need for `PYPI_API_TOKEN` — GitHub Actions authenticates directly.

---

## 7. Version Bumping Checklist

When releasing a new version, update these files:

| File | Field to Update |
|---|---|
| `package.json` | `version` |
| `packaging/pypi/pyproject.toml` | `version` (use PEP 440: `2.0.0a7` not `2.0.0-alpha.7`) |
| `packaging/pypi/milady/__init__.py` | `__version__` |
| `packaging/snap/snapcraft.yaml` | `version` |
| `packaging/debian/changelog` | Add new entry at top |
| `packaging/homebrew/milady.rb` | `url` + `sha256` (after npm publish) |
| `packaging/flatpak/ai.milady.Milady.metainfo.xml` | Add new `<release>` entry |

### Version Format Mapping

| Platform | Format | Example |
|---|---|---|
| npm | semver pre-release | `2.0.0-alpha.7` |
| PyPI (PEP 440) | alpha suffix | `2.0.0a7` |
| Debian | tilde for pre-release | `2.0.0~alpha7-1` |
| Snap | semver-ish | `2.0.0-alpha.7` |
| Flatpak | semver | `2.0.0-alpha.7` |
| Homebrew | follows npm tarball URL | (automatic) |

---

## Quick Reference: User Install Commands

| Platform | Command |
|---|---|
| **npm** | `npm install -g miladyai` |
| **PyPI** | `pip install milady` |
| **Homebrew** | `brew install milady-ai/tap/milady` |
| **apt** | `sudo apt install milady` (after adding repo) |
| **Snap** | `sudo snap install milady --classic` |
| **Flatpak** | `flatpak install flathub ai.milady.Milady` |
| **npx** | `npx miladyai` (no install) |
| **pipx** | `pipx install milady` |
