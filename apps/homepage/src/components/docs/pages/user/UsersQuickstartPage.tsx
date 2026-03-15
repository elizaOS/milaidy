import { TopicSections } from "../shared/TopicSections";

const content = `
# Quickstart

The shortest path to verifying your **Milady** installation is through the CLI wizard.

## Steps

1. **Launch**: Run \`npx milady start\` or \`bun run milady start\`.
2. **Configure**: Follow the interactive prompts to set:
   - Agent Name & Persona
   - Model Provider (OpenAI, Anthropic, etc.) & API Key
   - Default Tools
3. **Connect**: Test connectivity with \`/status\`.

## Verification

Before enabling complex workflows, verify:

- **Dashboard**: Is \`http://localhost:5173\` accessible?
- **Model**: Can the agent reply to "Hello"?
- **Logs**: Are there any red errors in the terminal?

## Next Steps

Once verified, you can proceed to:
- Enable **Plugins**
- Configure **Wallet**
- Setup **Social Connectors** (Telegram, Discord, Twitter)
`;

export function UsersQuickstartPage() {
  return <TopicSections content={content} />;
}
