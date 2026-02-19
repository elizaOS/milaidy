---
title: Media Generation
sidebarTitle: Media Generation
description: Generate images, videos, and audio, or analyze images using AI providers like FAL, OpenAI, Google, xAI, and Eliza Cloud.
---

# Media Generation

Milady includes a media generation abstraction layer that provides a unified interface for creating images, videos, and audio, as well as analyzing images with AI vision. Multiple provider backends are supported, with Eliza Cloud as the default (no API key required).

## Media Capabilities

### Image Generation

Generate images from text prompts with control over size, quality, and style.

**Supported providers:**

| Provider | Config Key | Notes |
|----------|-----------|-------|
| Eliza Cloud | `cloud` (default) | No API key required |
| FAL.ai | `fal` | Default model: `fal-ai/flux-pro` |
| OpenAI | `openai` | DALL-E models |
| Google | `google` | Imagen models |
| xAI | `xai` | Grok image generation |

**Parameters:**
- `prompt` (required) -- text description of the image
- `size` -- image dimensions (e.g., `1024x1024`, `1792x1024`)
- `quality` -- `standard` or `hd`
- `style` -- `natural` or `vivid`
- `negativePrompt` -- things to avoid in the generated image

### Video Generation

Generate videos from text prompts, optionally using an input image as the starting frame.

**Supported providers:**

| Provider | Config Key | Notes |
|----------|-----------|-------|
| Eliza Cloud | `cloud` (default) | No API key required |
| FAL.ai | `fal` | Default model: `fal-ai/minimax-video` |
| OpenAI | `openai` | Sora models |
| Google | `google` | Veo models |

**Parameters:**
- `prompt` (required) -- text description of the video
- `duration` -- video duration in seconds
- `aspectRatio` -- aspect ratio (e.g., `16:9`, `9:16`, `1:1`)
- `imageUrl` -- URL of an image to use as starting frame (image-to-video)

### Audio Generation

Generate music, songs, or sound effects from text prompts.

**Supported providers:**

| Provider | Config Key | Notes |
|----------|-----------|-------|
| Eliza Cloud | `cloud` (default) | No API key required |
| Suno | `suno` | Music and song generation |

**Parameters:**
- `prompt` (required) -- text description of the audio (lyrics, mood, style)
- `duration` -- audio duration in seconds
- `instrumental` -- whether to generate instrumental music without vocals
- `genre` -- music genre (e.g., `pop`, `rock`, `classical`, `electronic`)

### Image Analysis (Vision)

Analyze images to describe contents, identify objects, read text, or answer questions.

**Supported providers:**

| Provider | Config Key | Notes |
|----------|-----------|-------|
| Eliza Cloud | `cloud` (default) | No API key required |
| OpenAI | `openai` | GPT-4 Vision |
| Google | `google` | Gemini Vision |
| Anthropic | `anthropic` | Claude Vision |
| xAI | `xai` | Grok Vision |
| Ollama | `ollama` | Local models (no API key needed) |

**Parameters:**
- `imageUrl` -- URL of the image to analyze
- `imageBase64` -- base64-encoded image data (alternative to URL)
- `prompt` -- specific question or instruction (default: "Describe this image in detail.")
- `maxTokens` -- maximum tokens for the response

## Actions

Four built-in actions expose media generation to the agent:

### GENERATE_IMAGE

Triggers: `CREATE_IMAGE`, `MAKE_IMAGE`, `DRAW`, `PAINT`, `ILLUSTRATE`, `RENDER_IMAGE`, `IMAGE_GEN`, `TEXT_TO_IMAGE`

Generates an image from a text prompt. Returns the image URL or base64 data as an attachment.

### GENERATE_VIDEO

Triggers: `CREATE_VIDEO`, `MAKE_VIDEO`, `ANIMATE`, `RENDER_VIDEO`, `VIDEO_GEN`, `TEXT_TO_VIDEO`, `FILM`

Generates a video from a text prompt. Optionally accepts an image URL for image-to-video generation. Returns the video URL as an attachment.

### GENERATE_AUDIO

Triggers: `CREATE_AUDIO`, `MAKE_MUSIC`, `COMPOSE`, `GENERATE_MUSIC`, `CREATE_SONG`, `MAKE_SOUND`, `AUDIO_GEN`, `TEXT_TO_MUSIC`

Generates audio or music from a text prompt. Can create songs, sound effects, or instrumental tracks. Returns the audio URL as an attachment.

### ANALYZE_IMAGE

Triggers: `DESCRIBE_IMAGE`, `WHAT_IS_IN_IMAGE`, `IDENTIFY_IMAGE`, `READ_IMAGE`, `UNDERSTAND_IMAGE`, `VISION`, `OCR`, `IMAGE_TO_TEXT`

Analyzes an image using AI vision. Accepts either an image URL or base64-encoded data. Returns a text description with optional labels and confidence scores.

## Configuration

Media providers are configured in the `media` section of `milady.json`:

```json
{
  "media": {
    "image": {
      "mode": "own-key",
      "provider": "fal",
      "fal": {
        "apiKey": "your-fal-api-key",
        "model": "fal-ai/flux-pro",
        "baseUrl": "https://fal.run"
      }
    },
    "video": {
      "mode": "cloud",
      "provider": "cloud"
    },
    "audio": {
      "mode": "own-key",
      "provider": "suno",
      "suno": {
        "apiKey": "your-suno-api-key"
      }
    },
    "vision": {
      "mode": "own-key",
      "provider": "openai",
      "openai": {
        "apiKey": "your-openai-api-key",
        "model": "gpt-4o"
      }
    }
  }
}
```

### Mode Selection

Each media type supports two modes:

| Mode | Description |
|------|-------------|
| `cloud` | Uses Eliza Cloud as a proxy (default). No API key needed from the user. |
| `own-key` | Uses the user's own API key with their chosen provider. |

When `mode` is `cloud` (or unset), the system always routes to Eliza Cloud regardless of the `provider` field. When `mode` is `own-key`, the system uses the specified `provider` and its corresponding configuration block.

If the selected provider's API key is missing or the provider is not recognized, the system falls back to Eliza Cloud automatically.

### Eliza Cloud Configuration

Eliza Cloud settings are in the `cloud` section:

```json
{
  "cloud": {
    "baseUrl": "https://www.elizacloud.ai/api/v1",
    "apiKey": "optional-cloud-api-key"
  }
}
```

The default base URL is `https://www.elizacloud.ai/api/v1`. The API key is optional and can provide access to higher-tier cloud features.

### Provider-Specific API Keys

Each provider requires its own API key when using `own-key` mode:

- **FAL.ai**: `media.image.fal.apiKey` or `media.video.fal.apiKey`
- **OpenAI**: `media.image.openai.apiKey`, `media.video.openai.apiKey`, or `media.vision.openai.apiKey`
- **Google**: `media.image.google.apiKey`, `media.video.google.apiKey`, or `media.vision.google.apiKey`
- **xAI**: `media.image.xai.apiKey` or `media.vision.xai.apiKey`
- **Anthropic**: `media.vision.anthropic.apiKey`
- **Suno**: `media.audio.suno.apiKey`
- **Ollama** (vision only): No API key required, just a base URL (`media.vision.ollama.baseUrl`)
