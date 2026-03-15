import { TopicSections } from "../shared/TopicSections";

const content = `
# Architecture

Milady's architecture is a layered system designed for autonomy and extensibility.

## High-Level View

1. **Client Layer**: UI/CLI interfaces (React, Ink).
2. **Gateway Layer**: Manages sessions, routing, and tool dispatch.
3. **Runtime Layer (ElizaOS)**: Core agent loop (Perception -> Memory -> Planning -> Action).
4. **Plugin Layer**: Capabilities (Wallet, Browser, Search).
5. **Infrastructure**: Database (SQLite/Postgres), Vector Store, File System.

## Key Components

- **Runtime**: The brain. Handles context, prompt engineering, and LLM calls.
- **Memory Manager**: Stores short-term (RAM) and long-term (Vector DB) memory.
- **Provider**: Injects context (time, wallet balance) into the prompt.
- **Action**: Executable units (e.g., \`SEND_TOKEN\`, \`BROWSE_PAGE\`).

## Data Flow

1. **Input**: User message arrives via Client.
2. **Context**: Runtime gathers relevant memories and state.
3. **Decision**: LLM selects an Action based on prompt.
4. **Execution**: Plugin executes the Action.
5. **Feedback**: Result is stored in Memory and returned to User.
`;

export function DevArchitecturePage() {
  return <TopicSections content={content} />;
}
