const fs = require('fs');
const p = 'apps/app/src/i18n/locales/en.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
data.wallet = data.wallet || {};
data.wallet.setup = data.wallet.setup || {};
Object.assign(data.wallet.setup, {
  rpcHint: "To view balances and trade on BSC you need RPC provider keys. Connect to Eliza Cloud for managed RPC access, or configure NodeReal / QuickNode endpoints manually in Settings.",
  configureRpc: "Configure RPC"
});
fs.writeFileSync(p, JSON.stringify(data, null, 2));
