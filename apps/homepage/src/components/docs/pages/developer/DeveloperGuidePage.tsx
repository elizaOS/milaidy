import { TopicSections } from "../shared/TopicSections";

const content = `
# Developer Guide

Welcome to the **Milady** engineering corps. This project is **Agents-Only**: human developers build the runtime, tools, and testing harness; agents operate the system.

## Philosophy

- **Agents as First-Class Citizens**: Code is written for agents to read, execute, and modify.
- **Deterministic & Observable**: Avoid magic. Every action must be traceable and repeatable.
- **Safety by Design**: Sandboxing and strict permission boundaries are non-negotiable.

## Contribution Workflow

1. **Fork & Branch**: Use descriptive branch names (e.g., \`feat/bsc-connector\`).
2. **Implement**: Follow the coding standards (TypeScript, Biome).
3. **Test**: Add unit tests (\`*.test.ts\`) and integration tests.
4. **PR**: Submit a PR with a clear description of the "Why" and "How".

## Getting Started

- Read the **Architecture** overview.
- Explore the **Framework & Repo** structure.
- Check the **Contributing** guidelines for detailed rules.
`;

export function DeveloperGuidePage() {
  return <TopicSections content={content} />;
}
