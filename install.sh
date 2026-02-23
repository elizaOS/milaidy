#!/usr/bin/env bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  milAIdy installer — macOS / Linux / WSL / Git Bash                      ║
# ║                                                                          ║
# ║  curl -fsSL https://milady-ai.github.io/milady/install.sh | bash               ║
# ║                                                                          ║
# ║  Or, with custom domain:                                                ║
# ║    curl -fsSL https://get.milady.ai | bash                              ║
# ║                                                                          ║
# ║  For native Windows PowerShell, use install.ps1 instead.                 ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# What this script does:
#   1. Detects OS, architecture, and environment (WSL, Git Bash, etc.)
#   2. Checks for Node.js >= 22.12.0 (offers to install if missing)
#   3. Checks for a package manager (npm or bun)
#   4. Installs milady globally
#   5. Runs `milady setup` to initialize the workspace
#
# Environment variables:
#   MILADY_SKIP_SETUP=1         Skip the post-install `milady setup` step
#   MILADY_USE_BUN=1            Prefer bun over npm for installation
#   MILADY_VERSION=<ver>        Install a specific version (default: latest)
#   MILADY_LOCAL_TARBALL=<path> Install from a local .tgz (dev/testing)
#   MILADY_NONINTERACTIVE=1     Skip all prompts (assume yes)
#
# Desktop app install:
#   curl -fsSL https://get.milady.ai | bash -s -- --desktop
#
#   This downloads the latest Milady.app from GitHub Releases and copies
#   it to /Applications (macOS only).

set -euo pipefail

# ── Colors & helpers ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Disable colors when piped or on dumb terminals
if [[ ! -t 1 ]] || [[ "${TERM:-}" == "dumb" ]]; then
  RED="" GREEN="" YELLOW="" BLUE="" CYAN="" BOLD="" DIM="" RESET=""
fi

info()    { printf "${BLUE}i${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}+${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}!${RESET}  %s\n" "$*"; }
error()   { printf "${RED}x${RESET}  %s\n" "$*" >&2; }
step()    { printf "\n${BOLD}${CYAN}> %s${RESET}\n" "$*"; }

# Returns 0 (true) when we can prompt the user interactively.
can_prompt() {
  [[ "${MILADY_NONINTERACTIVE:-0}" != "1" ]] && [[ -t 0 ]]
}

# Prompt with a default answer; returns 0 for yes, 1 for no.
confirm() {
  local prompt="${1:-Continue?}" default="${2:-Y}"
  if ! can_prompt; then
    [[ "$default" =~ ^[Yy] ]]
    return $?
  fi
  local yn
  if [[ "$default" =~ ^[Yy] ]]; then
    printf "  %s [Y/n] " "$prompt"
  else
    printf "  %s [y/N] " "$prompt"
  fi
  read -r yn
  yn="${yn:-$default}"
  [[ "$yn" =~ ^[Yy] ]]
}

# ── Version comparison ───────────────────────────────────────────────────────

# Returns 0 if $1 >= $2 (semver major.minor.patch), 1 otherwise.
version_gte() {
  local IFS='.'
  local -a v1 v2
  read -ra v1 <<< "${1:-0.0.0}"
  read -ra v2 <<< "${2:-0.0.0}"

  local i
  for i in 0 1 2; do
    local a="${v1[$i]:-0}"
    local b="${v2[$i]:-0}"
    # Strip pre-release suffixes (e.g. 22.12.0-nightly → 22.12.0)
    a="${a%%-*}"
    b="${b%%-*}"
    if (( a > b )); then return 0; fi
    if (( a < b )); then return 1; fi
  done
  return 0
}

# ── System detection ─────────────────────────────────────────────────────────

DETECTED_OS=""
DETECTED_ARCH=""
DETECTED_ENV=""    # "wsl" | "gitbash" | "msys2" | "" (native)
DETECTED_DISTRO="" # "debian" | "fedora" | "alpine" | "arch" | "suse" | ""

detect_system() {
  # OS
  case "$(uname -s)" in
    Darwin)                      DETECTED_OS="macos"   ;;
    Linux)                       DETECTED_OS="linux"   ;;
    MINGW64*|MINGW32*|MINGW*)    DETECTED_OS="windows"; DETECTED_ENV="gitbash" ;;
    MSYS*)                       DETECTED_OS="windows"; DETECTED_ENV="msys2"   ;;
    CYGWIN*)                     DETECTED_OS="windows"; DETECTED_ENV="cygwin"  ;;
    *)                           DETECTED_OS="unknown" ;;
  esac

  # Arch
  case "$(uname -m)" in
    x86_64|amd64)   DETECTED_ARCH="x64"   ;;
    arm64|aarch64)   DETECTED_ARCH="arm64" ;;
    armv7l|armhf)    DETECTED_ARCH="armv7" ;;
    i686|i386)       DETECTED_ARCH="x86"   ;;
    *)               DETECTED_ARCH="$(uname -m)" ;;
  esac

  # WSL detection (Linux kernel but Microsoft underneath)
  if [[ "$DETECTED_OS" == "linux" ]]; then
    if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
      DETECTED_ENV="wsl"
    fi
  fi

  # Linux distro family
  if [[ "$DETECTED_OS" == "linux" ]]; then
    if [[ -f /etc/os-release ]]; then
      # shellcheck disable=SC1091
      local id=""
      id="$(. /etc/os-release && echo "${ID:-}")"
      local id_like=""
      id_like="$(. /etc/os-release && echo "${ID_LIKE:-}")"

      case "$id" in
        alpine)                    DETECTED_DISTRO="alpine" ;;
        arch|manjaro|endeavouros)  DETECTED_DISTRO="arch"   ;;
        fedora)                    DETECTED_DISTRO="fedora" ;;
        opensuse*|sles)            DETECTED_DISTRO="suse"   ;;
        debian|ubuntu|pop|mint|elementary|zorin|kali|raspbian)
                                   DETECTED_DISTRO="debian" ;;
        centos|rhel|rocky|alma|ol|amzn)
                                   DETECTED_DISTRO="rhel"   ;;
        *)
          # Fall back to ID_LIKE
          case "$id_like" in
            *debian*|*ubuntu*)     DETECTED_DISTRO="debian" ;;
            *rhel*|*fedora*|*centos*) DETECTED_DISTRO="rhel" ;;
            *arch*)                DETECTED_DISTRO="arch"   ;;
            *suse*)                DETECTED_DISTRO="suse"   ;;
          esac
          ;;
      esac
    elif [[ -f /etc/alpine-release ]]; then
      DETECTED_DISTRO="alpine"
    fi
  fi

  local env_label=""
  if [[ -n "$DETECTED_ENV" ]]; then
    env_label=" / ${DETECTED_ENV}"
  fi
  local distro_label=""
  if [[ -n "$DETECTED_DISTRO" ]]; then
    distro_label=" [${DETECTED_DISTRO}]"
  fi
  info "System: ${DETECTED_OS} ${DETECTED_ARCH}${env_label}${distro_label}"
}

# ── Prerequisite: curl or wget ───────────────────────────────────────────────

FETCH_CMD=""

detect_fetch() {
  if command -v curl &>/dev/null; then
    FETCH_CMD="curl"
  elif command -v wget &>/dev/null; then
    FETCH_CMD="wget"
  else
    error "Neither curl nor wget found. Please install one first."
    exit 1
  fi
}

# Download URL to stdout
fetch_url() {
  local url="$1"
  if [[ "$FETCH_CMD" == "curl" ]]; then
    curl -fsSL "$url"
  else
    wget -qO- "$url"
  fi
}

# ── Node.js check & install ─────────────────────────────────────────────────

REQUIRED_NODE_VERSION="22.12.0"

check_node() {
  if command -v node &>/dev/null; then
    local node_version
    node_version="$(node --version 2>/dev/null | sed 's/^v//')"
    if version_gte "$node_version" "$REQUIRED_NODE_VERSION"; then
      success "Node.js v${node_version} (>= ${REQUIRED_NODE_VERSION} required)"
      return 0
    else
      warn "Node.js v${node_version} found, but >= ${REQUIRED_NODE_VERSION} is required"
      return 1
    fi
  else
    warn "Node.js not found"
    return 1
  fi
}

# ── nvm (macOS / Linux / WSL) ────────────────────────────────────────────────

try_source_nvm() {
  if command -v nvm &>/dev/null; then
    return 0
  fi
  # Source nvm from well-known locations
  local dir
  for dir in \
    "${NVM_DIR:-}" \
    "$HOME/.nvm" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/nvm" \
  ; do
    if [[ -n "$dir" ]] && [[ -s "$dir/nvm.sh" ]]; then
      # shellcheck disable=SC1091
      source "$dir/nvm.sh"
      return 0
    fi
  done
  return 1
}

install_node_nvm() {
  info "Installing Node.js via nvm..."

  if ! try_source_nvm; then
    info "Installing nvm..."
    fetch_url "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh" | bash
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
  fi

  if ! command -v nvm &>/dev/null; then
    error "nvm installation failed"
    return 1
  fi

  nvm install "$REQUIRED_NODE_VERSION"
  nvm use "$REQUIRED_NODE_VERSION"
  success "Node.js ${REQUIRED_NODE_VERSION} installed via nvm"
}

# ── fnm (macOS / Linux / Windows) ───────────────────────────────────────────

install_node_fnm() {
  info "Installing Node.js via fnm..."

  if ! command -v fnm &>/dev/null; then
    info "Installing fnm..."
    fetch_url "https://fnm.vercel.app/install" | bash
    # fnm installs to different locations per platform
    for p in \
      "$HOME/.local/share/fnm" \
      "$HOME/.fnm" \
      "${APPDATA:-$HOME}/fnm" \
    ; do
      [[ -d "$p" ]] && export PATH="$p:$PATH"
    done
    eval "$(fnm env 2>/dev/null)" || true
  fi

  if ! command -v fnm &>/dev/null; then
    error "fnm installation failed"
    return 1
  fi

  fnm install "$REQUIRED_NODE_VERSION"
  fnm use "$REQUIRED_NODE_VERSION"
  success "Node.js ${REQUIRED_NODE_VERSION} installed via fnm"
}

# ── Platform-specific Node.js install ────────────────────────────────────────

install_node_macos() {
  # 1. nvm (if present or user agrees)
  if try_source_nvm || [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    install_node_nvm && return 0
  fi

  # 2. fnm
  if command -v fnm &>/dev/null; then
    install_node_fnm && return 0
  fi

  # 3. Homebrew
  if command -v brew &>/dev/null; then
    info "Installing Node.js via Homebrew..."
    brew install "node@22"
    brew link --overwrite "node@22" 2>/dev/null || true
    success "Node.js installed via Homebrew"
    return 0
  fi

  # 4. MacPorts
  if command -v port &>/dev/null; then
    info "Installing Node.js via MacPorts..."
    sudo port install nodejs22
    success "Node.js installed via MacPorts"
    return 0
  fi

  # 5. Offer to install nvm
  if confirm "No version manager found. Install nvm?"; then
    install_node_nvm && return 0
  fi

  return 1
}

install_node_linux() {
  # 1. nvm (if present or user agrees)
  if try_source_nvm || [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    install_node_nvm && return 0
  fi

  # 2. fnm
  if command -v fnm &>/dev/null; then
    install_node_fnm && return 0
  fi

  # 3. Distro package manager
  case "$DETECTED_DISTRO" in
    debian)
      info "Installing Node.js via NodeSource (apt)..."
      fetch_url "https://deb.nodesource.com/setup_22.x" | sudo -E bash -
      sudo apt-get install -y nodejs
      success "Node.js installed via apt"
      return 0
      ;;
    rhel|fedora)
      info "Installing Node.js via NodeSource (rpm)..."
      fetch_url "https://rpm.nodesource.com/setup_22.x" | sudo -E bash -
      if command -v dnf &>/dev/null; then
        sudo dnf install -y nodejs
      elif command -v yum &>/dev/null; then
        sudo yum install -y nodejs
      fi
      success "Node.js installed via rpm"
      return 0
      ;;
    alpine)
      info "Installing Node.js via apk..."
      sudo apk add --no-cache nodejs npm
      # Alpine's packaged Node may be too old — check version after install
      if check_node; then
        return 0
      fi
      warn "Alpine-packaged Node.js is too old, falling back to nvm"
      ;;
    arch)
      info "Installing Node.js via pacman..."
      sudo pacman -Sy --noconfirm nodejs npm
      success "Node.js installed via pacman"
      return 0
      ;;
    suse)
      info "Installing Node.js via zypper..."
      sudo zypper install -y nodejs22
      success "Node.js installed via zypper"
      return 0
      ;;
  esac

  # 4. Offer to install nvm
  if confirm "No version manager found. Install nvm?"; then
    install_node_nvm && return 0
  fi

  return 1
}

install_node_windows() {
  # Running inside Git Bash, MSYS2, or Cygwin on Windows

  # 1. fnm works well on Windows
  if command -v fnm &>/dev/null; then
    install_node_fnm && return 0
  fi

  # 2. nvm-windows (different from nvm-sh/nvm)
  if command -v nvm &>/dev/null; then
    info "Installing Node.js via nvm-windows..."
    nvm install "$REQUIRED_NODE_VERSION"
    nvm use "$REQUIRED_NODE_VERSION"
    success "Node.js ${REQUIRED_NODE_VERSION} installed via nvm-windows"
    return 0
  fi

  # 3. winget
  if command -v winget &>/dev/null; then
    info "Installing Node.js via winget..."
    winget install --id OpenJS.NodeJS.LTS --version "${REQUIRED_NODE_VERSION}" --accept-source-agreements --accept-package-agreements 2>/dev/null || \
      winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    success "Node.js installed via winget (restart your terminal to use it)"
    return 0
  fi

  # 4. Chocolatey
  if command -v choco &>/dev/null; then
    info "Installing Node.js via Chocolatey..."
    choco install nodejs-lts -y
    success "Node.js installed via Chocolatey"
    return 0
  fi

  # 5. Scoop
  if command -v scoop &>/dev/null; then
    info "Installing Node.js via Scoop..."
    scoop install nodejs-lts
    success "Node.js installed via Scoop"
    return 0
  fi

  # 6. Offer fnm install
  if confirm "No Node version manager found. Install fnm?"; then
    install_node_fnm && return 0
  fi

  return 1
}

install_node() {
  step "Installing Node.js >= ${REQUIRED_NODE_VERSION}"

  local install_ok=1
  case "$DETECTED_OS" in
    macos)   install_node_macos   && install_ok=0 ;;
    linux)   install_node_linux   && install_ok=0 ;;
    windows) install_node_windows && install_ok=0 ;;
  esac

  if [[ "$install_ok" -eq 0 ]]; then
    return 0
  fi

  error "Could not install Node.js automatically."
  error "Please install Node.js >= ${REQUIRED_NODE_VERSION} manually:"
  case "$DETECTED_OS" in
    macos)   error "  https://nodejs.org or: brew install node@22" ;;
    linux)   error "  https://nodejs.org or use your distro package manager" ;;
    windows) error "  https://nodejs.org or: winget install OpenJS.NodeJS.LTS" ;;
    *)       error "  https://nodejs.org" ;;
  esac
  exit 1
}

# ── Package manager check ───────────────────────────────────────────────────

DETECTED_PM=""

check_package_manager() {
  local prefer_bun="${MILADY_USE_BUN:-0}"

  if [[ "$prefer_bun" == "1" ]] && command -v bun &>/dev/null; then
    local bun_version
    bun_version="$(bun --version 2>/dev/null)"
    success "bun v${bun_version}"
    DETECTED_PM="bun"
    return 0
  fi

  if command -v npm &>/dev/null; then
    local npm_version
    npm_version="$(npm --version 2>/dev/null)"
    success "npm v${npm_version}"
    DETECTED_PM="npm"
    return 0
  fi

  if command -v bun &>/dev/null; then
    local bun_version
    bun_version="$(bun --version 2>/dev/null)"
    success "bun v${bun_version}"
    DETECTED_PM="bun"
    return 0
  fi

  error "No package manager found (npm or bun required)"
  error "npm should have been installed with Node.js."
  case "$DETECTED_OS" in
    windows)
      error "Try restarting your terminal so npm is on PATH."
      error "Or install bun: powershell -c \"irm bun.sh/install.ps1 | iex\""
      ;;
    *)
      error "Try restarting your shell, or install bun: curl -fsSL https://bun.sh/install | bash"
      ;;
  esac
  exit 1
}

# ── Install milady ─────────────────────────────────────────────────────────

install_milady() {
  local pm="$1"
  local version="${MILADY_VERSION:-latest}"
  local pkg="miladyai"
  local local_tarball="${MILADY_LOCAL_TARBALL:-}"

  if [[ "$version" != "latest" ]]; then
    pkg="miladyai@${version}"
  fi

  step "Installing milady"

  # Check if already installed at desired version
  if command -v milady &>/dev/null; then
    local current_version
    current_version="$(milady --version 2>/dev/null | tail -1)"
    if [[ "$version" == "latest" || "$current_version" == "$version" ]]; then
      success "milady ${current_version} already installed"
      return 0
    fi
    info "Upgrading milady ${current_version} -> ${version}"
  fi

  # Local tarball install (for development/testing)
  if [[ -n "$local_tarball" ]]; then
    info "Installing from local tarball: ${local_tarball}"
    case "$pm" in
      npm) npm install -g "$local_tarball" ;;
      bun) bun install -g "$local_tarball" ;;
    esac
  else
    case "$pm" in
      npm)
        info "Running: npm install -g ${pkg}"
        npm install -g "$pkg"
        ;;
      bun)
        info "Running: bun install -g ${pkg}"
        bun install -g "$pkg"
        ;;
    esac
  fi

  # Verify installation — rehash PATH on Windows shells
  hash -r 2>/dev/null || true

  if command -v milady &>/dev/null; then
    local installed_version
    installed_version="$(milady --version 2>/dev/null | tail -1)"
    success "milady ${installed_version} installed"
  else
    error "milady command not found after installation."
    error ""
    error "The global bin directory is probably not in your PATH."
    case "$DETECTED_OS" in
      windows)
        error "Try: set PATH=%APPDATA%\\npm;%PATH%"
        error "Or restart your terminal."
        ;;
      *)
        error "Try: export PATH=\"\$(npm config get prefix)/bin:\$PATH\""
        error "Then add that line to your ~/.bashrc or ~/.zshrc"
        ;;
    esac
    exit 1
  fi
}

# ── Desktop app install (macOS) ──────────────────────────────────────────────

GITHUB_REPO="milady-ai/milady"

install_desktop_app() {
  step "Installing Milady desktop app"

  if [[ "$DETECTED_OS" != "macos" ]]; then
    error "Desktop app install via this script is only supported on macOS."
    error "For Windows, download the .exe from:"
    error "  https://github.com/${GITHUB_REPO}/releases/latest"
    exit 1
  fi

  local version="${MILADY_VERSION:-latest}"
  local arch="$DETECTED_ARCH"
  local dmg_pattern

  # Determine which DMG to download based on architecture
  if [[ "$arch" == "arm64" ]]; then
    dmg_pattern="arm64"
  else
    dmg_pattern="x64"
  fi

  info "Detecting latest release..."

  local release_url
  if [[ "$version" == "latest" ]]; then
    release_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
  else
    release_url="https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}"
  fi

  local release_json
  release_json="$(fetch_url "$release_url" 2>/dev/null)" || {
    error "Failed to fetch release info from GitHub."
    error "Check https://github.com/${GITHUB_REPO}/releases"
    exit 1
  }

  # Extract DMG download URL matching our architecture
  local dmg_url
  dmg_url="$(printf '%s' "$release_json" \
    | grep -o '"browser_download_url":\s*"[^"]*\.dmg"' \
    | grep -i "$dmg_pattern" \
    | head -1 \
    | sed 's/"browser_download_url":\s*"//;s/"$//')"

  if [[ -z "$dmg_url" ]]; then
    # Fallback: try any DMG
    dmg_url="$(printf '%s' "$release_json" \
      | grep -o '"browser_download_url":\s*"[^"]*\.dmg"' \
      | head -1 \
      | sed 's/"browser_download_url":\s*"//;s/"$//')"
  fi

  if [[ -z "$dmg_url" ]]; then
    error "No .dmg found in the release assets."
    error "Download manually from: https://github.com/${GITHUB_REPO}/releases/latest"
    exit 1
  fi

  local dmg_name
  dmg_name="$(basename "$dmg_url")"
  local tmpdir
  tmpdir="$(mktemp -d)"
  local dmg_path="${tmpdir}/${dmg_name}"

  info "Downloading ${dmg_name}..."
  if [[ "$FETCH_CMD" == "curl" ]]; then
    curl -fSL --progress-bar -o "$dmg_path" "$dmg_url"
  else
    wget --show-progress -qO "$dmg_path" "$dmg_url"
  fi

  info "Mounting DMG..."
  local mount_point
  mount_point="$(hdiutil attach "$dmg_path" -nobrowse -noautoopen 2>/dev/null \
    | tail -1 | awk '{print $NF}')" || {
    # Sometimes the mount point path has spaces
    mount_point="$(hdiutil attach "$dmg_path" -nobrowse -noautoopen 2>/dev/null \
      | grep '/Volumes/' | sed 's/.*\(\/Volumes\/.*\)/\1/')"
  }

  if [[ -z "$mount_point" ]] || [[ ! -d "$mount_point" ]]; then
    error "Failed to mount DMG."
    rm -rf "$tmpdir"
    exit 1
  fi

  # Find the .app bundle in the mounted volume
  local app_path
  app_path="$(find "$mount_point" -maxdepth 1 -name '*.app' -print -quit 2>/dev/null)"

  if [[ -z "$app_path" ]]; then
    error "No .app bundle found in the DMG."
    hdiutil detach "$mount_point" -quiet 2>/dev/null || true
    rm -rf "$tmpdir"
    exit 1
  fi

  local app_name
  app_name="$(basename "$app_path")"

  # Remove existing version if present
  if [[ -d "/Applications/${app_name}" ]]; then
    warn "Removing existing /Applications/${app_name}..."
    rm -rf "/Applications/${app_name}" 2>/dev/null || {
      info "Need admin privileges to replace existing app..."
      sudo rm -rf "/Applications/${app_name}"
    }
  fi

  info "Copying ${app_name} to /Applications..."
  cp -R "$app_path" /Applications/ 2>/dev/null || {
    info "Need admin privileges to copy to /Applications..."
    sudo cp -R "$app_path" /Applications/
  }

  # Remove quarantine attribute so Gatekeeper doesn't block it
  xattr -cr "/Applications/${app_name}" 2>/dev/null || \
    sudo xattr -cr "/Applications/${app_name}" 2>/dev/null || true

  # Clean up
  hdiutil detach "$mount_point" -quiet 2>/dev/null || true
  rm -rf "$tmpdir"

  success "${app_name} installed to /Applications"
  info "You can launch it from Spotlight or your Applications folder."
}

# ── Post-install setup ───────────────────────────────────────────────────────

run_setup() {
  if [[ "${MILADY_SKIP_SETUP:-0}" == "1" ]]; then
    info "Skipping setup (MILADY_SKIP_SETUP=1)"
    return 0
  fi

  step "Initializing milady workspace"
  milady setup
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  printf "\n"
  printf "${BOLD}${CYAN}  +--------------------------------------+${RESET}\n"
  printf "${BOLD}${CYAN}  |       ${RESET}${BOLD}milAIdy installer${RESET}${BOLD}${CYAN}              |${RESET}\n"
  printf "${BOLD}${CYAN}  |  ${RESET}cute agents for the acceleration${BOLD}${CYAN}   |${RESET}\n"
  printf "${BOLD}${CYAN}  +--------------------------------------+${RESET}\n"
  printf "\n"

  # Parse arguments
  local install_desktop=false
  for arg in "$@"; do
    case "$arg" in
      --desktop) install_desktop=true ;;
      --help|-h)
        printf "Usage: install.sh [--desktop]\n\n"
        printf "  ${CYAN}--desktop${RESET}   Download and install the Milady desktop app (macOS)\n"
        printf "  ${DIM}(no flag)${RESET}   Install the milady CLI via npm/bun\n\n"
        exit 0
        ;;
    esac
  done

  detect_fetch
  detect_system

  # ── Desktop app install path ─────────────────────────────────────────────
  if [[ "$install_desktop" == "true" ]]; then
    install_desktop_app

    printf "\n"
    printf "${BOLD}${GREEN}  ======================================${RESET}\n"
    printf "${BOLD}${GREEN}  Desktop app installed!${RESET}\n"
    printf "${BOLD}${GREEN}  ======================================${RESET}\n"
    printf "\n"
    printf "  Open Milady from your Applications folder or Spotlight.\n\n"
    exit 0
  fi

  # ── CLI install path ─────────────────────────────────────────────────────

  # If on Windows but NOT in a bash-capable shell, direct to PowerShell script
  if [[ "$DETECTED_OS" == "windows" && -z "$DETECTED_ENV" ]]; then
    error "This bash script requires Git Bash, MSYS2, WSL, or Cygwin on Windows."
    error "For native Windows, use PowerShell instead:"
    error "  irm https://milady-ai.github.io/milady/install.ps1 | iex"
    exit 1
  fi

  if [[ "$DETECTED_ENV" == "wsl" ]]; then
    info "Running inside WSL (Windows Subsystem for Linux)"
  fi

  # ── Step 1: Node.js ──────────────────────────────────────────────────────
  step "Checking Node.js"

  if ! check_node; then
    install_node
    # Re-check after install
    if ! check_node; then
      error "Node.js installation failed or version still too old"
      exit 1
    fi
  fi

  # ── Step 2: Package manager ──────────────────────────────────────────────
  step "Checking package manager"

  check_package_manager
  local pm="$DETECTED_PM"

  # ── Step 3: Install milady ──────────────────────────────────────────────
  install_milady "$pm"

  # ── Step 4: Setup ────────────────────────────────────────────────────────
  run_setup

  # ── Done ─────────────────────────────────────────────────────────────────
  printf "\n"
  printf "${BOLD}${GREEN}  ======================================${RESET}\n"
  printf "${BOLD}${GREEN}  Installation complete!${RESET}\n"
  printf "${BOLD}${GREEN}  ======================================${RESET}\n"
  printf "\n"
  printf "  Get started:\n"
  printf "    ${CYAN}milady start${RESET}        Start the agent runtime\n"
  printf "    ${CYAN}milady setup${RESET}        Re-run workspace setup\n"
  printf "    ${CYAN}milady configure${RESET}    Configuration guidance\n"
  printf "    ${CYAN}milady --help${RESET}       Show all commands\n"
  printf "\n"
  printf "  Docs: ${BLUE}https://docs.milady.ai${RESET}\n"
  printf "\n"
}

main "$@"
