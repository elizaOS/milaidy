# Skills Documentation

Skills are markdown-based extensions that teach the agent how to perform specific tasks. Unlike plugins (which are TypeScript code), skills are primarily documentation that gets injected into the agent's context.

## Table of Contents

1. [What Are Skills?](#what-are-skills)
2. [Skill Structure](#skill-structure)
3. [Writing a Skill](#writing-a-skill)
4. [Skill Frontmatter](#skill-frontmatter)
5. [Adding Skills to Your Agent](#adding-skills-to-your-agent)
6. [Skill Loading Behavior](#skill-loading-behavior)
7. [Best Practices](#best-practices)

---

## What Are Skills?

Skills are **modular, self-contained packages** that extend an agent's capabilities through:

- **Instructions** — Markdown documentation the agent follows
- **Scripts** — Optional executable code for complex operations
- **References** — Additional documentation loaded into context
- **Assets** — Templates, images, or other files for output

### Skills vs Plugins

| Aspect | Skills | Plugins |
|--------|--------|---------|
| Format | Markdown (SKILL.md) | TypeScript code |
| Complexity | Low — documentation-focused | High — full programmatic control |
| Runtime | Injected into prompts | Runs as code |
| Use case | Task instructions, tool usage | Actions, services, API routes |
| Installation | Drop folder in skills/ | npm install or build |

**When to use Skills:**
- Teaching the agent to use CLI tools
- Documenting workflows and procedures
- Providing reference information
- Simple task automation via instructions

**When to use Plugins:**
- Custom actions with complex logic
- Background services
- API integrations
- Database operations

---

## Skill Structure

A skill is a folder containing at minimum a `SKILL.md` file:

```
my-skill/
├── SKILL.md              # Required — frontmatter + instructions
├── scripts/              # Optional — executable scripts
│   └── fetch-data.sh
├── references/           # Optional — additional docs to load
│   └── api-reference.md
└── assets/               # Optional — templates, images, etc.
    └── template.txt
```

### SKILL.md

The main skill file contains:

1. **Frontmatter** — YAML metadata at the top
2. **Instructions** — Markdown content teaching the agent

```markdown
---
name: github
description: "Interact with GitHub using the `gh` CLI"
metadata:
  requires:
    bins: ["gh"]
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub repositories.

## Pull Requests

Check CI status on a PR:

```bash
gh pr checks 55 --repo owner/repo
```

## Issues

List open issues:

```bash
gh issue list --repo owner/repo --state open
```
```

---

## Writing a Skill

### Step 1: Create the Skill Folder

```bash
mkdir -p ~/.milaidy/workspace/skills/my-tool
cd ~/.milaidy/workspace/skills/my-tool
```

### Step 2: Write SKILL.md

```markdown
---
name: my-tool
description: "Use my-tool CLI for data processing"
required-bins:
  - my-tool
required-env:
  - MY_TOOL_API_KEY
---

# My Tool Skill

This skill teaches you how to use the `my-tool` CLI.

## Installation

```bash
npm install -g my-tool
```

## Authentication

Set your API key:

```bash
export MY_TOOL_API_KEY="your-key-here"
```

## Basic Usage

### List Items

```bash
my-tool list --format json
```

### Create Item

```bash
my-tool create --name "New Item" --type standard
```

### Delete Item

```bash
my-tool delete <item-id> --force
```

## Common Workflows

### Batch Processing

1. Export items to file:
   ```bash
   my-tool export --output items.json
   ```

2. Process with jq:
   ```bash
   cat items.json | jq '.items[] | select(.status == "active")'
   ```

3. Import processed items:
   ```bash
   my-tool import --input processed.json
   ```

## Error Handling

- **401 Unauthorized**: Check MY_TOOL_API_KEY is set correctly
- **404 Not Found**: Verify the item ID exists
- **429 Rate Limited**: Wait 60 seconds and retry
```

### Step 3: Add Scripts (Optional)

If your skill needs executable logic:

```bash
# scripts/setup.sh
#!/bin/bash
set -e

echo "Checking my-tool installation..."
if ! command -v my-tool &> /dev/null; then
    echo "Installing my-tool..."
    npm install -g my-tool
fi

echo "my-tool is ready!"
```

### Step 4: Add References (Optional)

For additional documentation that should be loaded:

```markdown
<!-- references/api-spec.md -->
# API Reference

## Endpoints

### GET /items
Returns a list of all items.

Response:
```json
{
  "items": [
    {"id": "123", "name": "Item 1", "status": "active"}
  ]
}
```
```

---

## Skill Frontmatter

The YAML frontmatter at the top of SKILL.md configures skill behavior:

```yaml
---
# Required
name: skill-name
description: "Human-readable description"

# Optional — requirements
required-os:          # Limit to specific OSes
  - macos
  - linux
required-bins:        # Required CLI tools
  - gh
  - jq
required-env:         # Required environment variables
  - GITHUB_TOKEN

# Optional — behavior
disable-model-invocation: false  # If true, skill won't be in prompts
user-invocable: true             # Can users invoke via commands?
primary-env: node                # Primary runtime environment

# Optional — command dispatch
command-dispatch: shell          # How commands are executed
command-tool: bash               # Tool for command execution

# Optional — arbitrary metadata
metadata:
  emoji: "🔧"
  category: "devtools"
  install:
    - kind: brew
      formula: my-tool
---
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (should match folder name) |
| `description` | string | What the skill does (shown to LLM) |
| `disable-model-invocation` | boolean | Exclude from LLM prompts (command-only) |
| `required-os` | string[] | Limit to OSes: `macos`, `linux`, `windows` |
| `required-bins` | string[] | CLI tools that must be in PATH |
| `required-env` | string[] | Environment variables that must be set |
| `primary-env` | string | Runtime: `node`, `python`, `shell` |
| `user-invocable` | boolean | Allow direct user invocation |
| `command-dispatch` | string | How to dispatch commands |
| `command-tool` | string | Tool for command execution |
| `metadata` | object | Arbitrary additional data |

---

## Adding Skills to Your Agent

### 1. Workspace Skills (Project-Local)

Place skills in your project's workspace:

```
~/.milaidy/workspace/
└── skills/
    ├── my-skill/
    │   └── SKILL.md
    └── another-skill/
        └── SKILL.md
```

### 2. Managed Skills (Global)

Place skills in the global skills directory:

```
~/.milaidy/skills/
├── my-skill/
│   └── SKILL.md
└── shared-skill/
    └── SKILL.md
```

### 3. Bundled Skills

Milaidy ships with built-in skills in the `@elizaos/skills` package. These are automatically available:

- `github` — GitHub CLI integration
- `weather` — Weather lookups
- `tmux` — Terminal multiplexer control
- `coding-agent` — Run coding assistants
- And many more...

List bundled skills:
```bash
ls node_modules/@elizaos/skills/skills/
```

### 4. Explicit Skill Paths

Configure specific skill paths in your agent config:

```json
{
  "skills": {
    "paths": [
      "./custom-skills/special-skill",
      "~/shared-skills/team-skill"
    ],
    "includeDefaults": true
  }
}
```

---

## Skill Loading Behavior

### Load Order

Skills are loaded from multiple sources in this order (later sources can override earlier ones):

1. **Bundled skills** — From `@elizaos/skills` package
2. **Managed skills** — From `~/.milaidy/skills/` or `~/.elizaos/skills/`
3. **Workspace skills** — From `./skills/` in the project
4. **Explicit paths** — From config `skills.paths`

### Collision Handling

If two skills have the same name, the later one wins. A diagnostic warning is logged:

```
[skills] Collision: skill "github" from workspace overrides bundled version
```

### Loading Options

```typescript
import { loadSkills } from "@elizaos/skills";

const { skills, diagnostics } = loadSkills({
  // Working directory for workspace skills
  cwd: process.cwd(),

  // Agent config directory for global skills
  agentDir: "~/.milaidy",

  // Explicit paths to load
  skillPaths: ["./extra-skills/my-skill"],

  // Include default skill directories (default: true)
  includeDefaults: true,

  // Override bundled skills path
  bundledSkillsDir: "./custom-bundled",

  // Override managed skills path
  managedSkillsDir: "~/.my-agent/skills",
});

// Check for issues
for (const diag of diagnostics) {
  if (diag.type === "error") {
    console.error(`Skill error: ${diag.message}`);
  } else if (diag.type === "collision") {
    console.warn(`Skill collision: ${diag.message}`);
  }
}
```

### Skill Formatting for Prompts

Skills are formatted and injected into the agent's system prompt:

```typescript
import { formatSkillsForPrompt, loadSkills } from "@elizaos/skills";

const { skills } = loadSkills();

// Generate prompt section
const skillPrompt = formatSkillsForPrompt(skills);
// Returns formatted markdown listing available skills

// Or get a summary
const summary = formatSkillsList(skills);
// Returns: "github, weather, tmux, ..."
```

---

## Best Practices

### 1. Keep Instructions Concise

The skill content is injected into the agent's context window. Be thorough but not verbose:

```markdown
<!-- ❌ Too verbose -->
## Listing Files

To list files in a directory, you can use the `ls` command. The `ls` command
is a standard Unix utility that lists directory contents. It has many options
including -l for long format, -a for showing hidden files, -h for human-readable
sizes, and many more. Here's how you would use it...

<!-- ✅ Concise and actionable -->
## Listing Files

```bash
ls -la           # All files, long format
ls -lh *.txt     # Text files with human-readable sizes
```
```

### 2. Provide Runnable Examples

Show actual commands, not just descriptions:

```markdown
<!-- ❌ Descriptive but not actionable -->
Use the search command to find issues.

<!-- ✅ Runnable example -->
```bash
gh issue list --repo owner/repo --search "bug" --state open
```
```

### 3. Handle Errors

Document common errors and solutions:

```markdown
## Troubleshooting

### "Permission denied"
```bash
chmod +x script.sh  # Make script executable
```

### "Command not found"
Install the required tool:
```bash
brew install my-tool  # macOS
apt install my-tool   # Linux
```
```

### 4. Use Frontmatter for Requirements

Don't assume tools are installed — declare requirements:

```yaml
---
name: docker-skill
description: "Manage Docker containers"
required-bins:
  - docker
  - docker-compose
required-os:
  - macos
  - linux
---
```

### 5. Organize Complex Skills

For skills with multiple concerns:

```
complex-skill/
├── SKILL.md           # Main instructions
├── references/
│   ├── api.md         # API documentation
│   ├── examples.md    # Extended examples
│   └── faq.md         # Frequently asked questions
├── scripts/
│   ├── setup.sh       # Installation script
│   └── validate.sh    # Validation script
└── assets/
    └── config.template.json
```

### 6. Test Your Skills

Try your skill instructions manually first:

1. Read the SKILL.md yourself
2. Follow the instructions exactly
3. Fix any ambiguities or missing steps
4. Have someone else try it

---

## Example Skills

### Weather Skill

```markdown
---
name: weather
description: "Get current weather and forecasts"
---

# Weather Skill

Get weather information using wttr.in (no API key required).

## Current Weather

```bash
curl -s "wttr.in/London?format=3"
# Output: London: ⛅️ +15°C
```

## Detailed Forecast

```bash
curl -s "wttr.in/London"
```

## JSON Format (for parsing)

```bash
curl -s "wttr.in/London?format=j1" | jq '.current_condition[0]'
```

## Location Formats

- City name: `wttr.in/Paris`
- Airport code: `wttr.in/JFK`
- Coordinates: `wttr.in/40.7,-74.0`
- IP-based: `wttr.in` (auto-detect)
```

### GitHub Skill

```markdown
---
name: github
description: "Interact with GitHub using the `gh` CLI"
required-bins:
  - gh
---

# GitHub Skill

Use the `gh` CLI for GitHub operations.

## Authentication

```bash
gh auth login
gh auth status
```

## Issues

```bash
gh issue list --repo owner/repo
gh issue view 123 --repo owner/repo
gh issue create --title "Bug" --body "Description"
```

## Pull Requests

```bash
gh pr list --repo owner/repo
gh pr view 55 --repo owner/repo
gh pr checks 55 --repo owner/repo
gh pr merge 55 --repo owner/repo --squash
```

## Actions/CI

```bash
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo
gh run view <run-id> --log-failed
```

## API Access

```bash
gh api repos/owner/repo/issues --jq '.[].title'
gh api graphql -f query='{ viewer { login } }'
```
```

---

## Next Steps

- [Plugin Development Guide](./plugin-development.md) — For more complex extensions
- [Contributing Guide](./contributing.md) — Contributing skills to Milaidy
- Browse bundled skills: `ls node_modules/@elizaos/skills/skills/`
