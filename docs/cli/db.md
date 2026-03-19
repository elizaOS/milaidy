---
title: "milady db"
sidebarTitle: "db"
icon: "database"
description: "Manage your local Milady database. Reset or inspect the database used for agent state, character data, and conversation history."
---

## Overview

The `milady db` command provides database management utilities for your Milady installation. The local database stores agent state, character configurations, conversation history, and runtime data. Use this command to reset the database when troubleshooting or switching configurations.

## Database Location

Your Milady database is stored at:

```
~/.milady/workspace/.eliza/.elizadb
```

You can override this location by setting the `MILADY_STATE_DIR` environment variable:

```bash
export MILADY_STATE_DIR=/custom/path/to/state
milady db reset
```

## milady db reset

Deletes your local database completely. The database will be automatically recreated on the next `milady start` command with fresh, empty state.

### Usage

<Tabs>
  <Tab title="Interactive">
    ```bash
    milady db reset
    ```
    
    The command will display the database path and ask for confirmation before deletion:
    
    ```
    🗄️  Database location: ~/.milady/workspace/.eliza/.elizadb
    ⚠️  This will permanently delete all local data.
    
    Continue? (y/N)
    ```
    
    Type `y` and press Enter to confirm, or press Enter without input to cancel.
  </Tab>
  
  <Tab title="Non-interactive">
    ```bash
    milady db reset --yes
    ```
    
    The `--yes` flag skips the confirmation prompt and deletes the database immediately. Useful for automation and scripting.
  </Tab>
</Tabs>

### Flags

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmation prompt and proceed with deletion |

### What Happens

When you run `milady db reset`:

1. **Check** – The command verifies that the database exists at the expected location
2. **Confirm** – If not using `--yes`, prompts for confirmation (interactive mode only)
3. **Delete** – Removes all database files
4. **Report** – Displays status message confirming successful deletion

Example output:

```
✓ Database reset complete
  New database will be created on next milady start
```

### Deleted Data

The reset command permanently removes:

- **Agent state** – Current agent memory, context, and runtime state
- **Character data** – Character configurations and customizations
- **Conversation history** – All message logs and interaction records
- **Cached data** – Compiled templates, embeddings, and indices

<Warning>
This operation cannot be undone. There is no recovery mechanism for deleted data. Ensure you have backups before running this command.
</Warning>

## Use Cases

<AccordionGroup>
  <Accordion title="Stuck or Unresponsive Agent">
    If your agent is frozen, stuck in a loop, or not responding to commands:
    
    ```bash
    milady db reset --yes
    milady start
    ```
    
    A fresh database often resolves issues caused by corrupted state or invalid cached data.
  </Accordion>

  <Accordion title="Switching Characters or Personalities">
    When switching to a completely different character configuration, reset the database to prevent character data from interfering:
    
    ```bash
    milady character set new-character
    milady db reset --yes
    milady start
    ```
    
    This ensures the agent starts with a clean slate and proper initialization for the new character.
  </Accordion>

  <Accordion title="Development and Testing">
    During development, frequently reset the database to test clean state scenarios:
    
    ```bash
    # Run tests with fresh database
    milady db reset --yes
    bun run test
    
    # Or during iterative development
    milady db reset --yes && milady start
    ```
    
    Useful for verifying initialization logic and ensuring tests run in consistent conditions.
  </Accordion>

  <Accordion title="Reclaiming Disk Space">
    Over time, the database can accumulate cached data and conversation logs. Reset to reclaim disk space:
    
    ```bash
    milady db reset --yes
    ```
    
    The database directory will be much smaller after reset, with only the minimum required structure recreated on next start.
  </Accordion>
</AccordionGroup>

## Best Practices

<Tip>
Before running `milady db reset`, back up your database if it contains valuable conversation history or configurations:

```bash
cp -r ~/.milady/workspace/.eliza/.elizadb ~/.elizadb.backup
milady db reset --yes
```

This gives you a restore point if you need to recover data later.
</Tip>

- **Test in development first** – Always test database reset in a development environment before running on production agents
- **Stop the agent** – Ensure no Milady processes are running before resetting to avoid conflicts
- **Document your configuration** – Export important character configurations and settings before reset
- **Use version control** – Keep character files and configurations in version control so they survive database resets
