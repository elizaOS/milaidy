"""
CLI entry point for the milady dynamic loader.

Delegates all commands to the Milady Node.js runtime,
installing it automatically if needed.
"""

from __future__ import annotations

import sys

from milady.loader import MiladyError, run


def main() -> None:
    """Main CLI entry point — forwards all args to the Node.js milady CLI."""
    try:
        args = sys.argv[1:]
        exit_code = run(args)
        sys.exit(exit_code)
    except MiladyError as exc:
        print(f"milady: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
