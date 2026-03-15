import { TopicSections } from "../shared/TopicSections";

const content = `
# User Guide

**Milady BSC** is a personal AI assistant running on your local machine, built upon **ElizaOS** and optimized for **BSC (Binance Smart Chain)** scenarios.

It manages sessions, tools, and connectors through a central Gateway, providing access via a local Dashboard, CLI, Desktop App, and various messaging platforms.

## Core Concepts

- **Local-First & Privacy-First**: Designed to run without reliance on centralized hosted runtimes.
- **Unified Entry Points**: CLI, Dashboard, TUI, and Desktop App cover everything from novice to advanced usage.
- **BSC Native**: Deep integration with BSC wallets, plugins, and on-chain automation.

## Best Practices

1. **Start with Minimal Permissions**: Launch with basic settings before enabling sensitive capabilities.
2. **Gradual Adoption**: Enable wallet access, plugins, and autonomous loops one by one.
3. **Risk Management**: Always validate configuration in a safe environment to minimize error amplification.
`;

export function UserGuidePage() {
  return <TopicSections content={content} />;
}
