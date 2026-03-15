import { TopicSections } from "../shared/TopicSections";

const content = `
# Installation

**Milady** is a monorepo workspace. The installation requires a proper environment setup.

## Prerequisites

- **Node.js**: v22 or higher (LTS recommended).
- **Package Manager**: \`bun\` or \`pnpm\`.
- **System**: Windows (PowerShell), macOS, or Linux.

## Quick Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/miladybsc/milady.git
cd milady-bsc

# Install dependencies
bun install

# Build the project
bun run build
\`\`\`

## First-Time Setup

1. **Environment Variables**: Copy \`.env.example\` to \`.env\` and fill in required keys.
2. **Build Verification**: Run \`bun run check\` to ensure the environment is clean.
3. **Start**: Use \`bun run milady\` to launch the CLI.
`;

export function UsersInstallationPage() {
  return <TopicSections content={content} />;
}
