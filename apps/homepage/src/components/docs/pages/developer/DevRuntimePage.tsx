import { TopicSections } from "../shared/TopicSections";

const content = `
# Runtime & API

The **Runtime** is the heart of the agent. It bridges the LLM with the physical world (or digital environment).

## Core API

- \`runtime.processMessage(message: Memory)\`: Main entry point.
- \`runtime.evaluate(memory: Memory)\`: Asks the LLM to make a decision without side effects.
- \`runtime.registerAction(action: Action)\`: Adds a new capability.

## Configuration Model

Configuration is loaded from \`milady.json\` or environment variables.

\`\`\`json
{
  "agent": {
    "name": "Milady",
    "model": "gpt-4o",
    "plugins": ["@elizaos/plugin-solana", "@elizaos/plugin-bootstrap"]
  }
}
\`\`\`

## Providers

Providers inject dynamic context into the prompt.
- **TimeProvider**: Adds current date/time.
- **WalletProvider**: Adds current balance and portfolio.

## Actions

Actions are the "hands" of the agent.
- **validate**: Can this action run now?
- **handler**: The actual execution logic.
- **similes**: Examples of user intent that trigger this action.
`;

export function DevRuntimePage() {
  return <TopicSections content={content} />;
}
