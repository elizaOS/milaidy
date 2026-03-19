# Jeju / Bazaar plugin for Milady

Connects Milady to a Jeju localnet (Bazaar): agent-owned wallet, balances, and ETH↔USDC swap.

## Enable

**Recommended:** Settings → Plugins → **Jeju / Bazaar** → turn on, save if needed, then **restart Milady** when prompted so the agent loads JEJU_STATUS / JEJU_SWAP.

Alternatively add `jeju` to `plugins.allow` in `~/.milady/milady.json` (same effect after restart).

## Wallet

- First run creates a wallet and persists it at `~/.milady/jeju-wallet.json`.
- On startup the plugin logs the wallet address — fund it on your Jeju localnet (e.g. `jeju fund <address>`).
- ETH and USDC addresses are fixed for localnet; override via env if needed.

## Env (optional)

| Variable | Default |
|----------|---------|
| `JEJU_RPC_URL` | `http://127.0.0.1:6546` |
| `JEJU_CHAIN_ID` | `31337` |
| `JEJU_ROUTER_ADDRESS` | localnet XLPRouter |
| `JEJU_WETH_ADDRESS` | localnet WETH |
| `JEJU_USDC_ADDRESS` | localnet USDC |

## Actions

- **JEJU_STATUS** — Report wallet address and balances (ETH, WETH, USDC). Logged to terminal.
- **JEJU_SWAP** — Swap ETH→USDC or USDC→ETH. Parameters: `direction` (`eth_to_usdc` \| `usdc_to_eth`), `amount` (e.g. `0.1` or `100`). Logged to terminal.

## UI

Actions are currently logged in the Milady process terminal. A dashboard view and plugin activation UI are planned.
