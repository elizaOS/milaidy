import { TopicSections } from "../shared/TopicSections";

const content = `
# Privacy Controls

**Milady** is designed for privacy, but improper configuration can leak data.

## Default Posture

- **Local Only**: By default, the API binds to \`127.0.0.1\`.
- **No Cloud Sync**: Chat history and embeddings are stored locally in SQLite.
- **Model API**: External model providers (OpenAI/Anthropic) *do* receive your prompts.

## Network Exposure

If you expose the API (e.g., \`0.0.0.0\` binding):
- **Authentication**: Enable \`MILADY_API_TOKEN\`.
- **CORS**: Restrict \`Allowed Origins\` to trusted domains.
- **TLS**: Use a reverse proxy (Nginx/Caddy) with HTTPS.

## Data Boundaries

- **Logs**: Be careful with \`debug\` level logs; they may contain sensitive inputs.
- **Embeddings**: Ensure your vector database is not publicly accessible.
- **Plugins**: Third-party plugins may exfiltrate data. Audit them before use.

## Auditing

Periodically review:
- **Active Connections**: \`netstat\` or dashboard.
- **Log Files**: For accidental credential leakage.
`;

export function UsersPrivacyPage() {
  return <TopicSections content={content} />;
}
