"""
milady — Dynamic loader for Milady, a personal AI assistant built on ElizaOS.

This package provides a Python entry point that dynamically loads and runs
the Milady Node.js runtime. It handles Node.js detection, automatic
installation of the milady npm package, and seamless CLI delegation.

Usage (CLI):
    $ milady start
    $ milady setup
    $ milady --help

Usage (Python API):
    from milady import run, ensure_runtime, get_version

    # Ensure the runtime is ready
    ensure_runtime()

    # Run a command
    exit_code = run(["start"])

    # Get the installed version
    version = get_version()
"""

__version__ = "2.0.0a7"
__all__ = ["run", "ensure_runtime", "get_version", "MiladyError", "NodeNotFoundError"]

from milady.loader import (
    MiladyError,
    NodeNotFoundError,
    ensure_runtime,
    get_version,
    run,
)
