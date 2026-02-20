---
title: "Text-to-Speech Plugin"
sidebarTitle: "TTS"
description: "Text-to-speech plugin for Milaidy — ElevenLabs, OpenAI TTS, and Edge TTS voice synthesis."
---

The Text-to-Speech (TTS) plugin enables Milaidy agents to synthesize speech from text, providing voice responses through ElevenLabs, OpenAI TTS, or Microsoft Edge TTS.

**Package:** `@elizaos/plugin-tts`

## Overview

The TTS plugin registers a `TEXT_TO_SPEECH` model handler and actions that allow agents to generate audio from text. Generated audio can be played in voice channels (Discord, Telegram voice), saved to files, or streamed to the client.

## Installation

```bash
milaidy plugins install tts
```

## Enable via Features

```json
{
  "features": {
    "tts": true
  }
}
```

## Providers

### ElevenLabs

High-quality voice synthesis with voice cloning and emotion control.

**Package:** `@elizaos/plugin-elevenlabs`

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key from [elevenlabs.io](https://elevenlabs.io) |
| `ELEVENLABS_VOICE_ID` | No | Voice ID (default: Rachel) |
| `ELEVENLABS_MODEL_ID` | No | Model ID (default: `eleven_turbo_v2_5`) |

```json
{
  "features": {
    "tts": {
      "enabled": true,
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "modelId": "eleven_turbo_v2_5"
    }
  }
}
```

### OpenAI TTS

```json
{
  "features": {
    "tts": {
      "enabled": true,
      "provider": "openai",
      "voice": "alloy",
      "model": "tts-1"
    }
  }
}
```

Requires `OPENAI_API_KEY`.

### Edge TTS (Free, No API Key)

**Package:** `@elizaos/plugin-edge-tts`

Microsoft Edge TTS is free and requires no API key. Quality is lower than ElevenLabs but suitable for development.

```json
{
  "features": {
    "tts": {
      "enabled": true,
      "provider": "edge-tts",
      "voice": "en-US-AriaNeural"
    }
  }
}
```

## ElevenLabs Voice Options

### Popular Voices

| Voice ID | Name | Description |
|---------|------|-------------|
| `21m00Tcm4TlvDq8ikWAM` | Rachel | Calm, professional female |
| `AZnzlk1XvdvUeBnXmlld` | Domi | Strong female |
| `EXAVITQu4vr4xnSDxMaL` | Bella | Soft female |
| `ErXwobaYiN019PkySvjV` | Antoni | Well-rounded male |
| `MF3mGyEYCl7XYWbV9V6O` | Elli | Emotional female |
| `TxGEqnHWrfWFTfGW9XjX` | Josh | Deep male |

Browse all voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library).

### ElevenLabs Models

| Model ID | Description |
|---------|-------------|
| `eleven_turbo_v2_5` | Fastest, lowest latency |
| `eleven_turbo_v2` | Fast, good quality |
| `eleven_multilingual_v2` | Multilingual support |
| `eleven_monolingual_v1` | English only, high quality |

## OpenAI TTS Options

### Voices

| Voice | Description |
|-------|-------------|
| `alloy` | Neutral |
| `echo` | Male |
| `fable` | British male |
| `onyx` | Deep male |
| `nova` | Female |
| `shimmer` | Soft female |

### Models

| Model | Description |
|-------|-------------|
| `tts-1` | Faster, lower latency |
| `tts-1-hd` | Higher quality |

## Actions

| Action | Description |
|--------|-------------|
| `SPEAK` | Convert text to speech and play/return audio |
| `GENERATE_AUDIO` | Generate an audio file from text |
| `SET_VOICE` | Change the active voice |

## Usage Examples

After the plugin is loaded:

> "Read this article to me"

> "Say the following in a cheerful voice: Welcome to Milaidy!"

> "Generate an audio file from this text"

## Voice Channel Integration

When combined with Discord or Telegram connectors, the TTS plugin enables voice channel support:

- **Discord**: Agent joins voice channels and speaks responses
- **Telegram**: Agent sends voice messages as `.ogg` files

## Output Formats

| Format | Use Case |
|--------|---------|
| `mp3` | Streaming, Discord, general |
| `ogg_vorbis` | Telegram voice messages |
| `pcm` | Low-latency streaming |
| `wav` | Archival, high quality |

## Related

- [Image Generation Plugin](/plugin-registry/image-generation) — Image synthesis
- [Computer Use Plugin](/plugin-registry/computeruse) — Desktop automation
- [Media Generation Guide](/guides/media-generation) — Full media generation guide
