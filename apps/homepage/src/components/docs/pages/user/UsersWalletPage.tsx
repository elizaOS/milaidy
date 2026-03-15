import { TopicSections } from "../shared/TopicSections";

const content = `
# Wallet & BSC Safety

This branch is optimized for **BSC**, making wallet capabilities powerful but high-risk. Treat these features with extreme caution.

## Risk Principles

1. **Least Privilege**: Use dedicated wallets with minimal funds for the agent. **NEVER** use your main cold storage or high-value hot wallet.
2. **Isolation**: Keep agent funds separate from personal funds.
3. **Verification**: Always verify transactions, especially for new interactions.

## Configuration

- **Private Key**: Set via \`BSC_PRIVATE_KEY\` env var. Ensure \`.env\` is **gitignored**.
- **RPC URL**: Use a reliable RPC (e.g., from QuickNode or Alchemy) to avoid rate limits and front-running risks.

## On-Chain Failures

Common issues:
- **Gas**: Insufficient BNB for gas fees.
- **Nonce**: Transaction sequence mismatch (often due to manual + agent usage of same wallet).
- **Slippage**: High volatility causing swap failures.

## Emergency

If the agent behaves erratically:
1. **Stop**: Kill the process immediately (\`Ctrl+C\`).
2. **Revoke**: Use tools like Revoke.cash to remove approvals if needed.
3. **Drain**: Move funds to a safe wallet manually.
`;

export function UsersWalletPage() {
  return <TopicSections content={content} />;
}
