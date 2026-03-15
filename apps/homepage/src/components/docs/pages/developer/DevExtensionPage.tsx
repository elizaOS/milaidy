import { TopicSections } from "../shared/TopicSections";

const content = `
# Plugins & Skills

Plugins are the primary way to extend Milady's capabilities without modifying the core runtime.

## Anatomy of a Plugin

A plugin exports:
- **name**: Unique identifier.
- **description**: What it does.
- **actions**: Executable functions.
- **evaluators**: Background processes that analyze memory.
- **providers**: Context injectors.

\`\`\`typescript
const myPlugin: Plugin = {
  name: "weather",
  description: "Get weather info",
  actions: [getWeatherAction],
  // ...
};
\`\`\`

## Isolation Strategies

- **Network**: Plugins should use \`fetch\` via a proxied utility if possible.
- **State**: Use the \`CacheManager\` for temporary state; do not pollute the global scope.
- **Error Handling**: Wrap external calls in try-catch blocks to prevent crashing the agent.

## Skill Development

Skills are specialized plugins focused on specific domains (e.g., "coding", "finance").
- **Focused**: Do one thing well.
- **Composable**: Skills should be able to work together.
`;

export function DevExtensionPage() {
  return <TopicSections content={content} />;
}
