#!/usr/bin/env node
/**
 * Ensure required skills exist in ~/.milady/skills/
 *
 * This script is run during startup to ensure the milady-development skill
 * is available for the agent to use for self-modification workflows.
 *
 * Run automatically during startup, or manually:
 *   node scripts/ensure-skills.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MILADY_DIR = join(homedir(), ".milady");
const SKILLS_DIR = join(MILADY_DIR, "skills");

const MILADY_DEVELOPMENT_SKILL = `---
name: milady-development
description: "Self-modify milady agent through plugins. Edit, build, restart runtime, upgrade from upstream, manage plugins. For agent self-improvement and development workflows."
metadata:
  otto:
    emoji: "🔧"
    requires:
      bins: ["git", "bun"]
---

# Milady Development Skill

You are a self-modifying agent. You can edit your own code through **plugins**, rebuild, and restart yourself. All agent capabilities live in plugins - this is where you make changes.

**Important**: Do NOT modify eliza core (\`~/.milady/eliza\`). The core runtime is stable infrastructure. All customization happens through plugins.

## Directory Structure

\`\`\`
~/.milady/
├── eliza/                     # ElizaOS core (DO NOT MODIFY)
├── plugins/                   # Plugins - EDIT HERE
│   ├── plugin-discord/
│   ├── plugin-telegram/
│   ├── plugin-agent-helpers/
│   └── ...
└── skills/                    # Skills like this one
\`\`\`

## Plugin Architecture

Everything is a plugin. Want to add a new capability? Create or modify a plugin.

### Plugin Structure

\`\`\`
plugin-name/
├── typescript/
│   ├── src/
│   │   ├── index.ts       # Plugin entry point
│   │   ├── actions/       # Actions the agent can take
│   │   ├── providers/     # Context providers for LLM
│   │   └── services/      # Background services
│   ├── package.json
│   └── tsconfig.json
\`\`\`

### Key Plugin Concepts

- **Actions**: Things you can do (RESTART_AGENT, SEND_MESSAGE, etc.)
- **Providers**: Context injected into your prompts
- **Evaluators**: Run after actions to assess results
- **Services**: Background processes

## Editing Plugins

### Edit Local Plugins

Plugins at \`~/.milady/plugins/\` are editable:

\`\`\`bash
# List available plugins
ls ~/.milady/plugins/

# Read a plugin's entry point
cat ~/.milady/plugins/plugin-discord/typescript/src/index.ts
\`\`\`

### Eject a Registry Plugin

For plugins from the registry, eject them first:

Tell yourself: "Eject plugin-twitter so I can modify it"

This clones the plugin to \`~/.milady/plugins/\` for local editing.

### Create a New Plugin

\`\`\`bash
mkdir -p ~/.milady/plugins/plugin-my-feature/typescript/src/actions
\`\`\`

## Making Changes

1. **Identify the plugin** that handles what you want to change
2. **Read the plugin's index.ts** to understand exports
3. **Edit the relevant file** (action, provider, service)
4. **Restart** to load changes

Example - adding a new action:

\`\`\`typescript
// ~/.milady/plugins/plugin-my-feature/typescript/src/actions/my-action.ts
import type { Action } from "@elizaos/core";

export const myAction: Action = {
  name: "MY_ACTION",
  similes: ["DO_MY_THING"],
  description: "Does something useful",
  validate: async () => true,
  handler: async (runtime, message, state) => {
    return { text: "Done!", success: true };
  },
};
\`\`\`

Then export it from index.ts:

\`\`\`typescript
import type { Plugin } from "@elizaos/core";
import { myAction } from "./actions/my-action";

export const myFeaturePlugin: Plugin = {
  name: "plugin-my-feature",
  description: "My custom feature",
  actions: [myAction],
};

export default myFeaturePlugin;
\`\`\`

## Restarting the Runtime

After making changes, restart to load them.

### Method 1: RESTART_AGENT Action (Preferred)

Tell yourself: "Restart to apply changes"

### Method 2: API Endpoint

\`\`\`bash
curl -X POST http://localhost:3000/api/agent/restart
\`\`\`

## Plugin Management

You have the \`plugin-plugin-manager\` plugin:

- **Install**: "Install @elizaos/plugin-twitter"
- **Search**: "Search for blockchain plugins"
- **Eject**: "Eject plugin-discord so I can modify it"
- **Sync**: "Sync plugin-discord with upstream"
- **Reinject**: "Reinject plugin-discord" (discard changes)
- **List**: "List my ejected plugins"

## Upgrading Plugins

\`\`\`bash
cd ~/.milady/plugins
git fetch origin next
git merge --no-edit origin/next
bun install
\`\`\`

Or use the setup script:

\`\`\`bash
node scripts/setup-local-eliza.mjs --skip-eliza
\`\`\`

## Self-Modification Workflow

1. **Check if a plugin exists** that does something similar
2. **Decide**: modify existing or create new
3. **Make your changes** using Edit/Write tools
4. **Restart to apply**: "Restart to apply my changes"
5. **Test** the new functionality
6. **Iterate** if needed

## Important Paths

| What | Path |
|------|------|
| Plugins | \`~/.milady/plugins/\` |
| Skills | \`~/.milady/skills/\` |
| Eliza Core (read-only) | \`~/.milady/eliza/\` |

## Shell Commands

\`\`\`bash
# List plugins
ls ~/.milady/plugins/

# Update plugins
cd ~/.milady/plugins && git pull origin next && bun install

# Check upstream changes
cd ~/.milady/plugins && git fetch origin next && git rev-list --count HEAD..origin/next
\`\`\`
`;

function ensureSkillsDir() {
  if (!existsSync(SKILLS_DIR)) {
    console.log(`[ensure-skills] Creating ${SKILLS_DIR}...`);
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function ensureMiladyDevelopmentSkill() {
  const skillDir = join(SKILLS_DIR, "milady-development");
  const skillPath = join(skillDir, "SKILL.md");

  if (existsSync(skillPath)) {
    console.log("[ensure-skills] milady-development skill already exists");
    return;
  }

  console.log("[ensure-skills] Creating milady-development skill...");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, MILADY_DEVELOPMENT_SKILL);
  console.log("[ensure-skills] milady-development skill created");
}

function main() {
  ensureSkillsDir();
  ensureMiladyDevelopmentSkill();
}

main();
