import { TopicSections } from "../shared/TopicSections";

const content = `
# How to Use

Effective operation of your agent involves more than just chatting. It requires a rhythm of monitoring, maintenance, and interaction.

## Daily Operations

1. **Start**: Use \`milady start\` to spin up the agent.
2. **Monitor**: Check the **Dashboard** for active sessions and resource usage.
3. **Interact**: Use CLI or connected chat platforms (Telegram/Discord) to issue commands.

## Key Commands

- \`/help\`: List available commands.
- \`/status\`: Check agent health and connectivity.
- \`/reset\`: Clear session context (useful if the agent gets stuck).

## Maintenance

- **Update**: Pull the latest code and rebuild regularly (\`git pull && bun run build\`).
- **Logs**: Review logs in \`logs/\` directory for anomalies.
- **Backup**: Periodically backup your \`data/\` directory (SQLite database, configuration).

## Stability Tips

- **Restart**: If behavior degrades, a simple restart often fixes context issues.
- **Clean State**: Use \`milady clean\` (if implemented) or manually clear \`data/db.sqlite\` for a fresh start.
`;

export function UsersOperationsPage() {
  return <TopicSections content={content} />;
}
