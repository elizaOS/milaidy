import { TopicSections } from "../shared/TopicSections";

const content = `
# Capabilities

Milady BSC comes with a suite of built-in capabilities and an extensible plugin system.

## Core Features

- **Conversational Interface**: Multi-turn dialogue with memory.
- **Task Planning**: Decomposes complex goals into actionable steps.
- **Knowledge Retrieval**: Searches local docs and web (via connectors).

## BSC Integration

- **Wallet Management**: Check balances, transfer assets (native/BEP20).
- **DeFi Interactions**: Swap tokens, check prices.
- **Contract Calls**: Interact with any smart contract via ABI.

## Plugins

Extend functionality with plugins:

- **Browser**: Use headless browser to read web pages.
- **Social**: Telegram, Discord, Twitter integration.
- **Image Generation**: Create images on demand.
- **Custom**: Build your own TypeScript plugins.

## Future Roadmap

- Advanced **Trading Strategies**.
- **Cross-Chain** capabilities.
- **Multi-Agent** coordination.
`;

export function UsersCapabilitiesPage() {
  return <TopicSections content={content} />;
}
