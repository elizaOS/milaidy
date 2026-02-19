---
title: "Training & Fine-Tuning"
sidebarTitle: "Training & Fine-Tuning"
description: "Trajectory collection, dataset curation, fine-tuning workflows, and Ollama model import for agent self-improvement."
---

# Training & Fine-Tuning

Milaidy captures all LLM interactions as trajectories, which can be curated into training datasets and used to fine-tune local models. The training pipeline supports dataset building, training job management, model import to Ollama, and model activation.

## Table of Contents

1. [Trajectory Collection](#trajectory-collection)
2. [Trajectory Viewer](#trajectory-viewer)
3. [Training Datasets](#training-datasets)
4. [Fine-Tuning Workflow](#fine-tuning-workflow)
5. [Dashboard Integration](#dashboard-integration)
6. [API Endpoints](#api-endpoints)

---

## Trajectory Collection

Every LLM call made by the agent is automatically logged as part of a trajectory. The trajectory logger service (`@elizaos/plugin-trajectory-logger`) records:

### Trajectory Record

Each trajectory captures a complete agent interaction session:

```typescript
interface TrajectoryListItem {
  id: string;
  agentId: string;
  source: string;          // "chat", "autonomy", "telegram", "discord", "api"
  status: TrajectoryStatus; // "active", "completed", "error", "timeout"
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  llmCallCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  createdAt: string;
}
```

### LLM Call Records

Individual LLM calls within a trajectory include:

- Model name
- System prompt and user prompt
- Response text
- Temperature and max tokens
- Purpose and action type
- Latency in milliseconds
- Prompt and completion token counts

### Provider Access Records

Provider accesses (memory lookups, knowledge base queries, etc.) are also tracked:

- Provider name and ID
- Purpose description
- Data payload and query parameters
- Timestamp

### Logging Control

Trajectory logging can be toggled at runtime:

- `GET /api/trajectories/config` -- check if logging is enabled
- `PUT /api/trajectories/config` with `{ "enabled": true/false }` -- enable or disable

---

## Trajectory Viewer

The trajectory viewer provides filtering, search, export, and deletion capabilities.

### Listing and Filtering

Trajectories can be filtered by:

| Filter | Description |
|--------|-------------|
| `source` | Origin platform (chat, autonomy, telegram, discord, api) |
| `status` | active, completed, error, timeout |
| `startDate` / `endDate` | Time range |
| `search` | Full-text search |
| `scenarioId` | Evaluation scenario |
| `batchId` | Evaluation batch |
| `isTrainingData` | Filter to training-flagged trajectories |

Pagination is supported via `limit` (max 500, default 50) and `offset` parameters.

### Trajectory Detail

Viewing a single trajectory returns the full record with all LLM calls and provider accesses, organized by step. Each step may contain multiple LLM calls and provider accesses with their timestamps.

### Export Formats

Trajectories can be exported in multiple formats:

| Format | Description |
|--------|-------------|
| `json` | Full trajectory data as JSON |
| `csv` | Tabular format for spreadsheet analysis |
| `art` | Agent Replay Transcript format |
| `zip` | ZIP archive containing multiple trajectory files |

Export options include filtering by trajectory IDs, date range, scenario/batch IDs, and whether to include full prompts.

### Statistics

`GET /api/trajectories/stats` returns aggregate statistics about all recorded trajectories.

### Deletion

Trajectories can be deleted selectively by ID array or in bulk (`all: true`).

---

## Training Datasets

Training datasets are curated collections of trajectories prepared for fine-tuning.

### Building a Dataset

The `POST /api/training/datasets/build` endpoint creates a dataset from collected trajectories:

```json
{
  "limit": 1000,
  "minLlmCallsPerTrajectory": 2
}
```

- `limit` -- maximum number of trajectories to include
- `minLlmCallsPerTrajectory` -- filter out trajectories with too few LLM interactions

### Listing Datasets

`GET /api/training/datasets` returns all previously built datasets.

---

## Fine-Tuning Workflow

### Starting a Training Job

The `POST /api/training/jobs` endpoint launches a fine-tuning job:

```json
{
  "datasetId": "dataset-abc123",
  "maxTrajectories": 500,
  "backend": "mlx",
  "model": "llama-3.2-3b",
  "iterations": 100,
  "batchSize": 4,
  "learningRate": 0.0001
}
```

| Parameter | Description |
|-----------|-------------|
| `datasetId` | ID of a previously built dataset |
| `maxTrajectories` | Cap on trajectories to use |
| `backend` | Training backend: `mlx` (Apple Silicon), `cuda` (NVIDIA GPU), or `cpu` |
| `model` | Base model to fine-tune |
| `iterations` | Number of training iterations |
| `batchSize` | Training batch size |
| `learningRate` | Learning rate |

### Job Lifecycle

Training jobs emit stream events as they progress:

| Event Kind | Description |
|------------|-------------|
| `job_started` | Training job has begun |
| `job_progress` | Progress update with completion percentage |
| `job_log` | Training log output |
| `job_completed` | Training finished successfully |
| `job_failed` | Training encountered an error |
| `job_cancelled` | Training was cancelled by user |
| `dataset_built` | A new dataset was created |
| `model_activated` | A model was activated for agent use |
| `model_imported` | A model was imported to Ollama |

### Cancelling a Job

`POST /api/training/jobs/:id/cancel` cancels a running training job.

### Importing to Ollama

After training completes, the resulting model can be imported to Ollama for local inference:

`POST /api/training/models/:id/import-ollama`

```json
{
  "modelName": "my-fine-tuned-model",
  "baseModel": "llama-3.2-3b",
  "ollamaUrl": "http://localhost:11434"
}
```

The `ollamaUrl` must target a loopback host (localhost, 127.0.0.1, or ::1) for security.

### Activating a Model

`POST /api/training/models/:id/activate` switches the agent to use a fine-tuned model:

```json
{
  "providerModel": "ollama/my-fine-tuned-model"
}
```

### Benchmarking

`POST /api/training/models/:id/benchmark` runs evaluation benchmarks against a trained model.

---

## Dashboard Integration

The Milaidy dashboard provides two dedicated tabs for training:

### Fine-Tuning Tab (`FineTuningView`)

The Fine-Tuning view provides a complete UI for:

- Viewing training status and available trajectories
- Building datasets with configurable parameters
- Starting training jobs with backend/model selection
- Monitoring job progress in real-time via SSE stream events
- Importing completed models to Ollama
- Activating models for agent use

### Trajectories Tab (`TrajectoriesView`)

The Trajectories view displays:

- All captured LLM interactions with token counts and latency
- Status indicators (active, completed, error) with color coding
- Source badges (chat, autonomy, telegram, discord, api) with distinct colors
- Filtering by status and source
- Full-text search across trajectories
- Pagination (50 per page)
- Export to JSON/CSV/ZIP
- Bulk clearing of trajectory data

---

## API Endpoints

### Trajectory Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/trajectories` | List trajectories with filtering and pagination |
| `GET` | `/api/trajectories/:id` | Get full trajectory detail with LLM calls and provider accesses |
| `GET` | `/api/trajectories/stats` | Get aggregate trajectory statistics |
| `GET` | `/api/trajectories/config` | Check if trajectory logging is enabled |
| `PUT` | `/api/trajectories/config` | Enable or disable trajectory logging |
| `POST` | `/api/trajectories/export` | Export trajectories (json, csv, art, or zip) |
| `DELETE` | `/api/trajectories` | Delete trajectories by ID array or clear all |

### Training Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/training/status` | Get training service status |
| `GET` | `/api/training/trajectories` | List trajectories via training service (with limit/offset) |
| `GET` | `/api/training/trajectories/:id` | Get trajectory detail via training service |
| `GET` | `/api/training/datasets` | List all training datasets |
| `POST` | `/api/training/datasets/build` | Build a new dataset from trajectories |
| `GET` | `/api/training/jobs` | List all training jobs |
| `POST` | `/api/training/jobs` | Start a new training job |
| `GET` | `/api/training/jobs/:id` | Get training job details |
| `POST` | `/api/training/jobs/:id/cancel` | Cancel a running training job |
| `GET` | `/api/training/models` | List all trained models |
| `POST` | `/api/training/models/:id/import-ollama` | Import model to Ollama |
| `POST` | `/api/training/models/:id/activate` | Activate model for agent use |
| `POST` | `/api/training/models/:id/benchmark` | Run benchmarks against a model |
