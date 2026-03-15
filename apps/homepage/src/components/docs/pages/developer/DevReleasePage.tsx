import { TopicSections } from "../shared/TopicSections";

const content = `
# Release Checklist

Before releasing a new version of Milady, follow this strict checklist.

## Pre-Release

1. **Clean Build**: \`bun run clean && bun run build\` must pass without warnings.
2. **Test Suite**: \`bun run test\` (Unit) and \`bun run test:e2e\` (End-to-End) must pass.
3. **Audit**: \`bun run check\` for linting and formatting.

## Release Process

1. **Version Bump**: Update \`package.json\` version (SemVer).
2. **Changelog**: Generate \`CHANGELOG.md\` with summary of changes.
3. **Tag**: Create a git tag (\`v1.0.0\`).
4. **Publish**: Push to registry (if applicable) or create GitHub Release.

## Post-Release

- **Verify**: Install the new version in a clean environment.
- **Monitor**: Watch for crash reports or critical bugs in the first 24 hours.
- **Rollback**: Have a rollback plan ready (revert commit or tag).
`;

export function DevReleasePage() {
  return <TopicSections content={content} />;
}
