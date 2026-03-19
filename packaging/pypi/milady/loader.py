"""
Dynamic loader for the Milady Node.js runtime.

Responsibilities:
  1. Detect a suitable Node.js installation (>= 22.12.0)
  2. Detect or install the milady npm package
  3. Delegate CLI invocations to the Node.js process
  4. Provide a Python API for programmatic use
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from typing import Optional, Sequence, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

REQUIRED_NODE_VERSION: Tuple[int, int, int] = (22, 12, 0)
NPM_PACKAGE = "milady"
_VERSION_RE = re.compile(r"v?(\d+)\.(\d+)\.(\d+)")


# ── Exceptions ───────────────────────────────────────────────────────────────


class MiladyError(Exception):
    """Base exception for milady loader errors."""


class NodeNotFoundError(MiladyError):
    """Raised when a suitable Node.js installation cannot be found."""


class RuntimeInstallError(MiladyError):
    """Raised when the milady npm package cannot be installed."""


# ── Node.js Detection ────────────────────────────────────────────────────────


def _parse_version(version_str: str) -> Optional[Tuple[int, int, int]]:
    """Parse a semver string like 'v22.12.0' into a (major, minor, patch) tuple."""
    match = _VERSION_RE.search(version_str)
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def _find_node() -> Optional[str]:
    """Find a node binary on PATH."""
    return shutil.which("node")


def _get_node_version(node_bin: str) -> Optional[Tuple[int, int, int]]:
    """Get the version of a Node.js binary."""
    try:
        result = subprocess.run(
            [node_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return _parse_version(result.stdout.strip())
    except (subprocess.SubprocessError, OSError):
        pass
    return None


def _check_node() -> str:
    """
    Find and validate a Node.js installation.

    Returns the path to the node binary.
    Raises NodeNotFoundError if no suitable version is found.
    """
    node_bin = _find_node()
    if not node_bin:
        req = ".".join(str(v) for v in REQUIRED_NODE_VERSION)
        raise NodeNotFoundError(
            f"Node.js not found. Milady requires Node.js >= {req}.\n"
            "Install it from https://nodejs.org or via your package manager:\n"
            "  macOS:   brew install node@22\n"
            "  Linux:   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -\n"
            "  Windows: winget install OpenJS.NodeJS.LTS"
        )

    version = _get_node_version(node_bin)
    if version is None:
        raise NodeNotFoundError(
            f"Could not determine version of Node.js at {node_bin}"
        )

    if version < REQUIRED_NODE_VERSION:
        current = ".".join(str(v) for v in version)
        req = ".".join(str(v) for v in REQUIRED_NODE_VERSION)
        raise NodeNotFoundError(
            f"Node.js {current} found, but >= {req} is required.\n"
            "Please upgrade Node.js: https://nodejs.org"
        )

    return node_bin


# ── npm / npx Detection ─────────────────────────────────────────────────────


def _find_npx() -> Optional[str]:
    """Find npx on PATH."""
    return shutil.which("npx")


def _find_npm() -> Optional[str]:
    """Find npm on PATH."""
    return shutil.which("npm")


def _is_milady_installed_globally() -> bool:
    """Check if milady is installed as a global npm package."""
    npm_bin = _find_npm()
    if not npm_bin:
        return False
    try:
        result = subprocess.run(
            [npm_bin, "list", "-g", NPM_PACKAGE, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            deps = data.get("dependencies", {})
            return NPM_PACKAGE in deps
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        pass
    return False


def _find_milady_bin() -> Optional[str]:
    """Find the milady CLI binary on PATH (from a global npm install)."""
    return shutil.which("milady")


def _install_milady_global() -> None:
    """Install milady globally via npm."""
    npm_bin = _find_npm()
    if not npm_bin:
        raise RuntimeInstallError(
            "npm not found. Cannot install milady runtime.\n"
            "Install Node.js (which includes npm) from https://nodejs.org"
        )

    print(
        "milady: installing milady runtime (npm install -g miladyai)...",
        file=sys.stderr,
    )
    try:
        result = subprocess.run(
            [npm_bin, "install", "-g", NPM_PACKAGE],
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeInstallError(
                f"Failed to install {NPM_PACKAGE} via npm (exit code {result.returncode}).\n"
                "Try running manually: npm install -g miladyai"
            )
        print("milady: milady runtime installed successfully.", file=sys.stderr)
    except subprocess.TimeoutExpired:
        raise RuntimeInstallError(
            f"Timed out installing {NPM_PACKAGE}. Check your network connection."
        )


# ── Public API ───────────────────────────────────────────────────────────────


def ensure_runtime() -> str:
    """
    Ensure the Milady Node.js runtime is available.

    Checks for Node.js, then checks for the milady npm package.
    Installs milady globally if not found.

    Returns:
        Path to the milady CLI binary or npx fallback.

    Raises:
        NodeNotFoundError: If Node.js is not installed or too old.
        RuntimeInstallError: If milady cannot be installed.
    """
    _check_node()

    milady_bin = _find_milady_bin()
    if milady_bin:
        return milady_bin

    # Not found on PATH — try installing globally
    _install_milady_global()

    milady_bin = _find_milady_bin()
    if not milady_bin:
        # Fall back to npx
        npx_bin = _find_npx()
        if npx_bin:
            return npx_bin
        raise RuntimeInstallError(
            "milady was installed but the binary was not found on PATH.\n"
            "Try: export PATH=\"$(npm config get prefix)/bin:$PATH\""
        )

    return milady_bin


def run(args: Optional[Sequence[str]] = None) -> int:
    """
    Run a milady CLI command.

    Args:
        args: CLI arguments to pass to milady (e.g. ["start", "--verbose"]).
              If None, defaults to empty list.

    Returns:
        The exit code from the milady process.

    Raises:
        MiladyError: If the runtime cannot be found or started.
    """
    if args is None:
        args = []

    bin_path = ensure_runtime()

    # If we got npx back (fallback), run via npx
    if os.path.basename(bin_path) == "npx":
        cmd = [bin_path, NPM_PACKAGE, *list(args)]
    else:
        cmd = [bin_path, *list(args)]

    try:
        result = subprocess.run(cmd)
        return result.returncode
    except FileNotFoundError:
        raise MiladyError(f"Could not execute: {bin_path}")
    except OSError as exc:
        raise MiladyError(f"Failed to run milady: {exc}")


def get_version() -> Optional[str]:
    """
    Get the installed milady version.

    Returns:
        Version string (e.g. "2.0.0-alpha.7") or None if not installed.
    """
    milady_bin = _find_milady_bin()
    if not milady_bin:
        return None

    try:
        result = subprocess.run(
            [milady_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip().split("\n")[-1]
    except (subprocess.SubprocessError, OSError):
        pass
    return None
