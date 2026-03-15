import { TopicSections } from "../shared/TopicSections";

const content = `
# Implementation Dossiers

The \`docs/\` directory contains three major implementation dossiers: **autonomous-loop**, **fast-mode**, and **triggers-system**. These are not just readmes, but engineering blueprints.

## 1. Autonomous Loop

Focuses on the agent's ability to act without user prompting.

- **Goal**: Self-directed exploration and maintenance.
- **Key Concepts**: Identity, Trust, Context Bridging.
- **Risks**: Infinite loops, resource exhaustion.

## 2. Fast Mode

Focuses on low-latency interactions for chat.

- **Goal**: < 500ms response time for simple queries.
- **Key Concepts**: Model Routing (Small vs Large models), Parallel Execution.
- **Risks**: Hallucination due to smaller models.

## 3. Triggers System

Focuses on event-driven architecture.

- **Goal**: React to external events (blockchain, time, webhooks).
- **Key Concepts**: Event Bus, Subscription, Filter.
- **Risks**: Event storms, missed triggers.

## Usage

When modifying these systems:
1. **Read**: The specific dossier in \`docs/\`.
2. **Plan**: Update the phase document if necessary.
3. **Execute**: Follow the constraints defined in the dossier.
`;

export function DevDossiersPage() {
  return <TopicSections content={content} />;
}
