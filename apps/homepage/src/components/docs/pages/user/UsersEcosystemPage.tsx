import { TopicSections } from "../shared/TopicSections";

const content = `
# Product & Ecosystem

**Milady BSC** is not just a chatbot. It is a fully autonomous agent framework integrated into the **Binance Smart Chain (BSC)** ecosystem.

## Vision

To empower users with **sovereign AI agents** that can:
- Manage digital assets securely.
- Interact with decentralized applications (dApps).
- Automate on-chain workflows.

## Ecosystem Positioning

- **Users**: Personal assistant for portfolio tracking, trading execution, and information retrieval.
- **Developers**: Extensible platform for building agentic dApps.
- **Community**: Open-source collaboration hub for AI x Crypto experiments.

## Key Differentiators

| Feature | Milady BSC | Traditional Bots |
| :--- | :--- | :--- |
| **Runtime** | Local & Autonomous | Cloud & Scripted |
| **Wallet** | User-Controlled | Custodial / None |
| **Logic** | LLM-Driven | Rule-Based |
| **Privacy** | High | Low |
`;

export function UsersEcosystemPage() {
  return <TopicSections content={content} />;
}
