import { TopicSections } from "../shared/TopicSections";

const content = `
# Source Coverage

This documentation site aggregates content from multiple sources in the repository.

## Sources

- **\`apps/ref/gitbook\`**: Legacy GitBook content.
  - \`product/\`: Product vision, roadmap.
  - \`user/\`: User guides.
- **\`docs/\`**: Engineering dossiers and technical deep dives.
  - \`autonomous-loop/\`: Agent autonomy logic.
  - \`fast-mode/\`: Performance optimizations.
  - \`triggers-system/\`: Event architecture.

## Mapping

| Source Directory | Documentation Page | Status |
| :--- | :--- | :--- |
| \`apps/ref/gitbook/product\` | Product & Ecosystem | ✅ |
| \`apps/ref/gitbook/user\` | User Guide, Installation | ✅ |
| \`docs/autonomous-loop\` | Implementation Dossiers | ✅ |
| \`docs/fast-mode\` | Implementation Dossiers | ✅ |
| \`docs/triggers-system\` | Implementation Dossiers | ✅ |

## Missing Content

- **PDFs**: Analysis documents in root.
- **DOCX**: Requirement specs.
- **AM Records**: Archive of AMAs and community calls.
`;

export function DevSourceCoveragePage() {
  return <TopicSections content={content} />;
}
