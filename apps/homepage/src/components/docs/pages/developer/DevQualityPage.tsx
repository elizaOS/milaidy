import { TopicSections } from "../shared/TopicSections";

const content = `
# Testing & Quality

Milady employs a rigorous testing strategy to ensure agent reliability.

## Test Pyramid

1. **Unit Tests** (\`vitest\`): Fast, isolated tests for utility functions and logic.
2. **Integration Tests**: Test interactions between Runtime and Plugins.
3. **E2E Tests**: Full system tests (often mocked LLM) ensuring the CLI and API work together.

## Quality Gates

- **Lint**: \`bun run check\` runs Biome linting.
- **Type Check**: \`tsc --noEmit\` ensures type safety.
- **Coverage**: Critical paths must have high test coverage.

## Verification Strategies

- **Mocking**: Use \`vi.mock()\` for external APIs (OpenAI, RPC).
- **Snapshot Testing**: Use snapshots for deterministic outputs (e.g., prompt generation).
- **Property-Based Testing**: Generate random inputs to find edge cases.
`;

export function DevQualityPage() {
  return <TopicSections content={content} />;
}
