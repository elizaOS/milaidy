# Local Dev: Plugin Eject System

> How to work with ejected plugins during local development.

## Overview

The eject system lets you clone an upstream plugin's source locally, modify it, and have the runtime load your local copy instead of the npm package. All ejected plugins live outside the repo in `~/.milady/plugins/ejected/`.

## Quick Start

### 1. Eject a plugin

Via agent action (chat):
```
eject the telegram plugin so I can edit its source
```

Or manually:
```bash
# Clone upstream source
git clone --branch 1.x https://github.com/elizaos-plugins/plugin-telegram.git \
  ~/.milady/plugins/ejected/plugin-telegram

cd ~/.milady/plugins/ejected/plugin-telegram

# Install deps + build
npm install
npm run build
```

### 2. Create upstream tracking metadata

Every ejected plugin needs a `.upstream.json` at its root:

```json
{
  "$schema": "milaidy-upstream-v1",
  "source": "github:elizaos-plugins/plugin-telegram",
  "gitUrl": "https://github.com/elizaos-plugins/plugin-telegram.git",
  "branch": "1.x",
  "commitHash": "093613e...",
  "ejectedAt": "2026-02-16T08:00:00Z",
  "npmPackage": "@elizaos/plugin-telegram",
  "npmVersion": "1.6.4",
  "lastSyncAt": null,
  "localCommits": 0
}
```

### 3. Edit source

Make your changes in `~/.milady/plugins/ejected/plugin-telegram/src/`. After editing:

```bash
cd ~/.milady/plugins/ejected/plugin-telegram
npm run build
```

### 4. Restart runtime

The runtime auto-discovers ejected plugins. Just restart milady and it will load the ejected version instead of the npm package.

## Directory Structure

```
~/.milady/
└── plugins/
    ├── installed/     # npm-installed plugins (managed by plugin-installer)
    ├── custom/        # hand-written drop-in plugins
    └── ejected/       # git-cloned upstream plugins for editing
        └── plugin-telegram/
            ├── .upstream.json    # upstream tracking metadata
            ├── package.json
            ├── src/              # editable source
            ├── dist/             # built output (runtime loads this)
            └── node_modules/     # plugin's own deps
```

## Plugin Loading Priority

When the runtime resolves plugins, ejected versions always win:

1. **Ejected** (`~/.milady/plugins/ejected/`) — highest priority
2. **Official npm** (`node_modules/@elizaos/plugin-*`) — with install record repair
3. **User-installed** (`~/.milady/plugins/installed/`)
4. **Local @milady** (`src/plugins/`)
5. **npm fallback** (`import(name)`)

This means you can eject any plugin — even core `@elizaos/*` ones — and your local version takes over.

## Agent Actions

The agent has four built-in actions for managing ejected plugins:

| Action | Description |
|--------|-------------|
| `EJECT_PLUGIN` | Clone a plugin's source for editing |
| `SYNC_PLUGIN` | Pull upstream changes, merge with local edits |
| `REINJECT_PLUGIN` | Remove local source, revert to npm version |
| `LIST_EJECTED_PLUGINS` | Show all ejected plugins + upstream status |

## Syncing with Upstream

```bash
cd ~/.milady/plugins/ejected/plugin-telegram

# Check what's changed upstream
git fetch origin
git log HEAD..origin/1.x --oneline

# Pull changes (if no local uncommitted edits)
git pull --ff-only origin 1.x

# Or if you have local commits
git pull --rebase origin 1.x

# Rebuild
npm run build
```

Or via agent: `sync the ejected telegram plugin`

## Creating a PR from Ejected Source

The ejected plugin is a real git repo. You can push changes upstream:

```bash
cd ~/.milady/plugins/ejected/plugin-telegram

# Add your fork as a remote
git remote add fork git@github.com:YOUR_USER/plugin-telegram.git

# Push your branch
git checkout -b feat/enhanced-features
git add -A && git commit -m "feat: add typing indicators, smart chunking, draft streaming"
git push fork feat/enhanced-features

# Open PR against upstream
gh pr create --repo elizaos-plugins/plugin-telegram --base 1.x
```

## Reverting (Reinject)

To stop using the ejected version and fall back to npm:

```bash
rm -rf ~/.milady/plugins/ejected/plugin-telegram
# Restart milady — it will load the npm version again
```

Or via agent: `reinject the telegram plugin`

## Troubleshooting

**Plugin not loading after eject?**
- Check that `npm run build` succeeded (look for `dist/` output)
- Check that `package.json` has a valid `name` field matching the expected plugin name
- Check runtime logs for `Loading ejected plugin:` messages

**Build errors?**
- Run `npm install` first — ejected plugins have their own `node_modules/`
- Check the upstream repo's README for build requirements

**Merge conflicts on sync?**
- The sync action will report conflicted files
- Resolve manually, then `git add` + rebuild

## API Endpoint

```
GET /api/plugins/ejected
```

Returns list of ejected plugins with their `.upstream.json` metadata.
