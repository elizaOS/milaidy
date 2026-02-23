---
title: "Ollama Plugin"
sidebarTitle: "Ollama"
description: "Ollama local model inference for Milady — run Llama, Mistral, Gemma, and other models entirely on-device."
---

The Ollama plugin connects Milady agents to a locally running Ollama instance, enabling fully on-device inference with no API keys and no data leaving your machine.

**Package:** `@elizaos/plugin-ollama`

## Installation

### 1. Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS (Homebrew)
brew install ollama
```

### 2. Pull a Model

```bash
ollama pull llama3.3
# or
ollama pull mistral
# or
ollama pull gemma3:12b
```

### 3. Start Ollama

```bash
ollama serve
```

Ollama listens on `http://localhost:11434` by default.

### 4. Enable the Plugin

```bash
milady plugins install ollama
```

## Auto-Enable

The plugin auto-enables when `OLLAMA_BASE_URL` is present:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `OLLAMA_BASE_URL` | Yes | Ollama server URL (default: `http://localhost:11434`) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "ollama",
        "model": "llama3.3"
      }
    }
  }
}
```

## Supported Models

Any model available in the Ollama library works. Common choices:

| Model | Parameters | Context | Best For |
|-------|-----------|---------|---------|
| `llama3.3` | 70B | 128k | General purpose |
| `llama3.2` | 3B / 1B | 128k | Fast, lightweight |
| `mistral` | 7B | 32k | Efficient reasoning |
| `mixtral` | 8x7B | 32k | Code and analysis |
| `gemma3` | 4B / 12B / 27B | 128k | Instruction following |
| `qwen2.5` | 7B / 14B / 32B | 128k | Multilingual |
| `phi4` | 14B | 16k | Microsoft Phi series |
| `deepseek-r1` | 7B–70B | 128k | Reasoning |
| `nomic-embed-text` | — | — | Embeddings |

Browse all available models at [ollama.com/library](https://ollama.com/library).

## Model Type Mapping

| ElizaOS Model Type | Default Ollama Model |
|-------------------|---------------------|
| `TEXT_SMALL` | `llama3.2` (3B) |
| `TEXT_LARGE` | `llama3.3` (70B) |
| `TEXT_EMBEDDING` | `nomic-embed-text` |
| `IMAGE_DESCRIPTION` | `llava` (if installed) |

Override defaults in your auth profile:

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "ollama",
        "model": "mistral",
        "modelSmall": "llama3.2:3b"
      }
    }
  }
}
```

## Features

- Fully local — no API keys, no network calls
- Compatible with OpenAI API format
- GPU acceleration (NVIDIA CUDA, Apple Metal, AMD ROCm)
- Streaming responses
- Function calling (model-dependent)
- Vision input (llava, gemma3 multimodal variants)

## Hardware Requirements

| Model Size | RAM Required | GPU VRAM |
|-----------|-------------|---------|
| 7B | 8 GB | 6 GB |
| 13B | 16 GB | 10 GB |
| 34B | 32 GB | 24 GB |
| 70B | 64 GB | 48 GB |

Models run on CPU if insufficient VRAM is available, but with reduced speed.

## Remote Ollama

Ollama can run on a remote machine or NAS. Set `OLLAMA_BASE_URL` to the remote address:

```bash
export OLLAMA_BASE_URL=http://192.168.1.100:11434
```

Secure with a reverse proxy (Nginx + TLS) for production.

## Related

- [Groq Plugin](/plugin-registry/llm/groq) — Fast cloud inference for Llama models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Multi-provider gateway
- [Model Providers Guide](/model-providers) — Compare all providers
