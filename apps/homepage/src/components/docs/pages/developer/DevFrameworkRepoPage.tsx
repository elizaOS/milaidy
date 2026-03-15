import { TopicSections } from "../shared/TopicSections";

const content = `
# Framework & Repository

This is a modern TypeScript monorepo using **pnpm** workspaces and **Turborepo** (or similar script orchestration).

## Directory Structure

- \`apps/\`: Applications (Web, Mobile, Desktop).
  - \`homepage/\`: This documentation site.
  - \`app/\`: The main Milady application.
- \`packages/\`: Shared libraries.
  - \`core/\`: The ElizaOS runtime core.
  - \`plugin-*\`: Official plugins.
- \`scripts/\`: Build and maintenance scripts.

## Tech Stack

- **Runtime**: Node.js v22+ / Bun.
- **Language**: TypeScript (Strict mode).
- **Build**: \`tsdown\`, \`vite\`.
- **Test**: \`vitest\`.
- **Lint/Format**: \`biome\`.

## Engineering Standards

1. **Strict Typing**: No \`any\`. Use generics and interfaces.
2. **Modular**: Small files (< 300 LOC). Single responsibility.
3. **Tested**: Business logic must have unit tests.
`;

export function DevFrameworkRepoPage() {
  return <TopicSections content={content} />;
}
