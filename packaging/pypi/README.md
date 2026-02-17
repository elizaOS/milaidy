# milady

**Dynamic Python loader for [Milady](https://github.com/milady-ai/milady)** — a personal AI assistant built on [ElizaOS](https://github.com/elizaos).

This package provides a `milady` command that automatically manages the Node.js-based Milady runtime. Install via pip, run like any CLI tool.

## Install

```bash
pip install milady
```

Or with [pipx](https://pipx.pypa.io/) for isolated CLI install:

```bash
pipx install milady
```

## Quick Start

```bash
# Start your personal AI agent (installs runtime automatically on first run)
milady start

# Or just run it — interactive onboarding guides you through setup
milady

# Show all commands
milady --help
```

## How It Works

`milady` is a **dynamic loader** — a thin Python wrapper that:

1. Checks for Node.js >= 22.12.0 on your system
2. Ensures the `milady` npm package is installed globally
3. Forwards all CLI commands to the Node.js runtime
4. Installs the runtime automatically if not present

This means you get the full Milady experience through pip/pipx, without needing to interact with npm directly.

## Python API

```python
from milady import run, ensure_runtime, get_version

# Ensure the runtime is installed and ready
ensure_runtime()

# Run a milady command programmatically
exit_code = run(["start"])

# Check the installed version
version = get_version()
print(f"Milady {version}")
```

## Requirements

- **Python** >= 3.9
- **Node.js** >= 22.12.0 (the loader will tell you how to install it if missing)

## What is Milady?

Milady is a personal AI assistant you run on your own devices. It provides:

- Zero-config onboarding with interactive setup
- Support for multiple AI providers (Anthropic, OpenAI, Google, Ollama, etc.)
- Web dashboard at `http://localhost:18789`
- Plugin system for extensibility
- Web3 wallet integration (EVM + Solana)
- Desktop apps for macOS, Windows, and Linux

## Links

- [Documentation](https://docs.milady.ai)
- [GitHub](https://github.com/milady-ai/milady)
- [ElizaOS](https://github.com/elizaos)

## License

MIT
