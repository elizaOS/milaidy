import fs from 'fs';
const file = 'apps/app/src/components/companion/CompanionHeader.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replaceAll('`className={`', 'className={`');
content = content.replaceAll('`}`\n', '`}\n');
content = content.replaceAll('`}`\n            >', '`}\n            >');
fs.writeFileSync(file, content);
