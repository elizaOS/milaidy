import fs from 'fs';
import path from 'path';

const basePath = 'apps/app/src/components/companion/';

// 1. CompanionCharacterRoster.tsx(47,19): 'active' is never read
let rosterPath = path.join(basePath, 'CompanionCharacterRoster.tsx');
if (fs.existsSync(rosterPath)) {
  let roster = fs.readFileSync(rosterPath, 'utf8');
  roster = roster.replace(/const active = .*?;/, '');
  fs.writeFileSync(rosterPath, roster);
}

// 2. CompanionWalletPanel.tsx: walletPortfolioChain, walletReady, rpcReady, gasReady
let walletPath = path.join(basePath, 'CompanionWalletPanel.tsx');
if (fs.existsSync(walletPath)) {
  let wallet = fs.readFileSync(walletPath, 'utf8');
  wallet = wallet.replace(/\s+walletPortfolioChain,/, '');
  wallet = wallet.replace(/\s+walletReady,/, '');
  wallet = wallet.replace(/\s+rpcReady,/, '');
  wallet = wallet.replace(/\s+gasReady,/, '');
  fs.writeFileSync(walletPath, wallet);
}

// 3. WalletPortfolioList.tsx(21,3): 'walletSelectedTokenKey'
let portfolioPath = path.join(basePath, 'WalletPortfolioList.tsx');
if (fs.existsSync(portfolioPath)) {
  let portfolio = fs.readFileSync(portfolioPath, 'utf8');
  portfolio = portfolio.replace(/\s+walletSelectedTokenKey,/, '');
  fs.writeFileSync(portfolioPath, portfolio);
}

// 4. WalletSwapPanel.tsx(92,17): 'isActive', 'railActive'
let swapPath = path.join(basePath, 'WalletSwapPanel.tsx');
if (fs.existsSync(swapPath)) {
  let swap = fs.readFileSync(swapPath, 'utf8');
  swap = swap.replace(/\s+const isActive = .*?;/, '');
  swap = swap.replace(/\s+const railActive = .*?;/, '');
  fs.writeFileSync(swapPath, swap);
}

// 5. WalletTradeHistory.tsx(38,3): 'walletRecentFilter'
let historyPath = path.join(basePath, 'WalletTradeHistory.tsx');
if (fs.existsSync(historyPath)) {
  let history = fs.readFileSync(historyPath, 'utf8');
  history = history.replace(/\s+walletRecentFilter,/, '');
  history = history.replace(/\s+setWalletRecentFilter,/, ''); // just in case
  fs.writeFileSync(historyPath, history);
}

// 6. WalletTradingProfileModal.tsx(15,3): 'windowFilter', 'sourceFilter'
let profilePath = path.join(basePath, 'WalletTradingProfileModal.tsx');
if (fs.existsSync(profilePath)) {
  let profile = fs.readFileSync(profilePath, 'utf8');
  profile = profile.replace(/\s+windowFilter,/, '');
  profile = profile.replace(/\s+sourceFilter,/, '');
  fs.writeFileSync(profilePath, profile);
}

console.log('Fixed TS errors in Wallet components');
