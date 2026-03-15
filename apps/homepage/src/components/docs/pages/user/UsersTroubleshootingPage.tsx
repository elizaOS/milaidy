import { TopicSections } from "../shared/TopicSections";

const content = `
# Troubleshooting

When things go wrong, follow this structured approach to diagnose and resolve issues.

## Diagnostic Sequence

1. **Process**: Is the node process running? (\`ps aux | grep milady\`)
2. **Logs**: Check the terminal output or \`logs/error.log\`.
3. **Connectivity**: Can you reach the model provider? (\`curl https://api.openai.com\`)
4. **Configuration**: Are environment variables loaded correctly?

## Common Issues

### "Model not responding"
- **Cause**: API Key quota exceeded or network timeout.
- **Fix**: Check your provider dashboard; try a different model.

### "Wallet transaction failed"
- **Cause**: Insufficient gas or RPC error.
- **Fix**: Check BNB balance; switch RPC endpoint.

### "Plugin not loading"
- **Cause**: Dependency mismatch or build error.
- **Fix**: Run \`bun install\` and \`bun run build\` again.

## Reporting Bugs

If you can't solve it, open an issue on GitHub with:
- **Reproduction Steps**: Detailed actions to trigger the bug.
- **Logs**: Relevant error stack traces.
- **Environment**: OS, Node version, commit hash.
`;

export function UsersTroubleshootingPage() {
  return <TopicSections content={content} />;
}
