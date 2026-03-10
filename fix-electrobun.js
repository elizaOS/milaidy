const fs = require('fs');
const glob = require('glob');
const files = glob.sync('apps/app/electrobun/src/native/__tests__/*.test.ts');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/const g = globalThis as any; g\.Bun = \{([\s\S]*?)\}\);/g, 'const g = globalThis as any; g.Bun = {$1};');
  fs.writeFileSync(file, content);
}
