const fs = require('fs');
const files = ['en.json', 'ko.json', 'es.json', 'pt.json', 'zh-CN.json'];

function flatten(obj, prefix = '', res = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      flatten(v, `${prefix}${k}.`, res);
    } else {
      res[`${prefix}${k}`] = v;
    }
  }
  return res;
}

for (const file of files) {
  const p = `apps/app/src/i18n/locales/${file}`;
  if (fs.existsSync(p)) {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const flat = flatten(data);
    fs.writeFileSync(p, JSON.stringify(flat, null, 2));
    console.log(`Flattened ${file}`);
  }
}
