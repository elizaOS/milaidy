---
title: "Workbench API"
sidebarTitle: "Workbench"
description: "REST API endpoints for the workbench — tasks, todos, and the unified overview dashboard."
---

The workbench API manages the agent's task board and todo list. Tasks represent higher-level objectives tracked by the runtime, while todos are lightweight checklist items. The overview endpoint aggregates both alongside trigger and autonomy state for the dashboard.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workbench/overview` | Unified dashboard overview |
| GET | `/api/workbench/tasks` | List all tasks |
| POST | `/api/workbench/tasks` | Create a new task |
| GET | `/api/workbench/tasks/:id` | Get a single task |
| PUT | `/api/workbench/tasks/:id` | Update a task |
| DELETE | `/api/workbench/tasks/:id` | Delete a task |
| GET | `/api/workbench/todos` | List all todos |
| POST | `/api/workbench/todos` | Create a new todo |
| GET | `/api/workbench/todos/:id` | Get a single todo |
| PUT | `/api/workbench/todos/:id` | Update a todo |
| DELETE | `/api/workbench/todos/:id` | Delete a todo |
| POST | `/api/workbench/todos/:id/complete` | Toggle todo completion |

---

### GET /api/workbench/overview

Returns a combined view of tasks, triggers, todos, autonomy state, and summary counts. This is the primary endpoint for the workbench dashboard.

**Response**

```json
{
  "tasks": [
    {
      "id": "uuid",
      "name": "Process incoming data",
      "description": "Analyze and store data feeds",
      "tags": ["workbench-task"],
      "isCompleted": false
    }
  ],
  "triggers": [
    {
      "id": "uuid",
      "displayName": "Hourly Check",
      "enabled": true,
      "schedule": "0 * * * *"
    }
  ],
  "todos": [
    {
      "id": "uuid",
      "name": "Review latest logs",
      "description": "Check for anomalies",
      "isCompleted": false,
      "priority": 1,
      "isUrgent": false,
      "type": "task"
    }
  ],
  "summary": {
    "totalTasks": 3,
    "completedTasks": 1,
    "totalTriggers": 2,
    "activeTriggers": 2,
    "totalTodos": 5,
    "completedTodos": 2
  },
  "autonomy": {
    "enabled": true,
    "thinking": false,
    "lastEventAt": 1718000000000
  },
  "tasksAvailable": true,
  "triggersAvailable": true,
  "todosAvailable": true
}
```

---

## Tasks

### GET /api/workbench/tasks

List all workbench tasks, sorted alphabetically by name.

**Response**

```json
{
  "tasks": [
    {
      "id": "uuid",
      "name": "Process data",
      "description": "...",
      "tags": ["workbench-task"],
      "isCompleted": false
    }
  ]
}
```

---

### POST /api/workbench/tasks

Create a new workbench task.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Task name |
| `description` | string | No | Task description |
| `tags` | string[] | No | Additional tags (auto-includes `workbench-task`) |
| `isCompleted` | boolean | No | Initial completion state (default `false`) |

**Response** (201)

```json
{
  "task": {
    "id": "uuid",
    "name": "New task",
    "description": "",
    "tags": ["workbench-task"],
    "isCompleted": false
  }
}
```

---

### GET /api/workbench/tasks/:id

Get a single task by ID.

**Response**

```json
{
  "task": { "id": "uuid", "name": "...", "isCompleted": false }
}
```

| Status | Condition |
|--------|-----------|
| 404 | Task not found |

---

### PUT /api/workbench/tasks/:id

Update an existing task.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name (cannot be empty) |
| `description` | string | No | Updated description |
| `tags` | string[] | No | Updated tags |
| `isCompleted` | boolean | No | Completion state |

**Response**

```json
{
  "task": { "id": "uuid", "name": "Updated name", "isCompleted": true }
}
```

---

### DELETE /api/workbench/tasks/:id

Delete a task.

**Response**

```json
{
  "ok": true
}
```

---

## Todos

### GET /api/workbench/todos

List all workbench todos. Combines runtime task-backed todos with database-backed todos (from the todo data service plugin), de-duplicated and sorted alphabetically.

**Response**

```json
{
  "todos": [
    {
      "id": "uuid",
      "name": "Review logs",
      "description": "Check for errors",
      "isCompleted": false,
      "priority": 1,
      "isUrgent": false,
      "type": "task"
    }
  ]
}
```

---

### POST /api/workbench/todos

Create a new todo. If the todo data service plugin is available, the todo is stored in the database; otherwise it falls back to the runtime task system.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Todo name |
| `description` | string | No | Todo description |
| `priority` | number | No | Priority level |
| `isUrgent` | boolean | No | Urgency flag |
| `type` | string | No | Todo type (default `task`) |
| `isCompleted` | boolean | No | Initial completion state |
| `tags` | string[] | No | Additional tags |

**Response** (201)

```json
{
  "todo": {
    "id": "uuid",
    "name": "New todo",
    "isCompleted": false,
    "priority": null,
    "isUrgent": false,
    "type": "task"
  }
}
```

---

### GET /api/workbench/todos/:id

Get a single todo by ID.

**Response**

```json
{
  "todo": { "id": "uuid", "name": "...", "isCompleted": false }
}
```

| Status | Condition |
|--------|-----------|
| 404 | Todo not found |

---

### PUT /api/workbench/todos/:id

Update an existing todo.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name |
| `description` | string | No | Updated description |
| `priority` | number\|null | No | Updated priority |
| `isUrgent` | boolean | No | Urgency flag |
| `type` | string | No | Todo type |
| `isCompleted` | boolean | No | Completion state |
| `tags` | string[] | No | Updated tags |

**Response**

```json
{
  "todo": { "id": "uuid", "name": "Updated", "isCompleted": true }
}
```

---

### DELETE /api/workbench/todos/:id

Delete a todo.

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/workbench/todos/:id/complete

Toggle the completion state of a todo. This is a convenience endpoint that only updates the `isCompleted` field.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isCompleted` | boolean | Yes | Whether the todo is complete |

**Response**

```json
{
  "ok": true
}
```
