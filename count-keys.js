const fs = require('fs');
const en = JSON.parse(fs.readFileSync('apps/app/src/i18n/locales/en.json', 'utf8'));
const flatKeys = (obj, prefix = '') => {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object') {
      keys = keys.concat(flatKeys(v, `${prefix}${k}.`));
    } else {
      keys.push(`${prefix}${k}`);
    }
  }
  return keys;
};
const keys = flatKeys(en);
console.log(`Total keys in en.json: ${keys.length}`);
