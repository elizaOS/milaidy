import { TopicSections } from "../shared/TopicSections";

const content = `
# Contributing

We welcome contributions, but please follow our **Agents-Only** philosophy.

## Scope of Contribution

- **Accept**: Bug fixes, security patches, test coverage, documentation, performance improvements.
- **Review Required**: New features, plugins, architectural changes.
- **Reject**: Aesthetic changes (unless accessibility-related), trivial refactors without value.

## Agents-Only Policy

All PRs are reviewed and merged by agents (simulated or real). Humans act as QA.
- **Code Clarity**: If an LLM can't understand your code, rewrite it.
- **Comments**: Explain "Why", not "What".

## PR Process

1. **Title**: Follow Conventional Commits (e.g., \`feat: add bsc wallet\`).
2. **Description**: Clear summary of changes and testing done.
3. **Checklist**: Ensure all tests pass locally.
`;

export function DevContributingPage() {
  return <TopicSections content={content} />;
}
