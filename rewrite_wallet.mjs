import fs from 'fs';
import path from 'path';

const COMPANION_DIR = 'apps/app/src/components/companion';
const walletFiles = fs.readdirSync(COMPANION_DIR).filter(f => f.startsWith('Wallet') && f.endsWith('.tsx'));
walletFiles.push('CompanionWalletPanel.tsx', 'CompanionCharacterRoster.tsx');

for (const file of walletFiles) {
  const filePath = path.join(COMPANION_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/className="anime-wallet-[^"]+"/g, 'className="text-sm"');
  content = content.replace(/className=\{`anime-wallet-[^`]+`\}/g, 'className={`text-sm`}');
  
  content = content.replace(/className="anime-roster-[^"]+"/g, 'className="text-sm"');
  content = content.replace(/className=\{`anime-roster-[^`]+`\}/g, 'className={`text-sm`}');

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
}
