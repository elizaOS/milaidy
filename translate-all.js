const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function translate(text, tl) {
    if (!text || text.trim() === '') return text;
    // Use google translate unauthenticated API
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(p => p[0]).join('');
    } catch (err) {
        console.error(`Failed to translate "${text}" to ${tl}:`, err);
        return text;
    }
}

async function run() {
    const localesDir = path.join(process.cwd(), 'apps/app/src/i18n/locales');
    const enFile = path.join(localesDir, 'en.json');
    const enData = JSON.parse(fs.readFileSync(enFile, 'utf8'));

    const targets = ['zh-CN', 'ko', 'es', 'pt'];

    for (const target of targets) {
        console.log(`Processing ${target}...`);
        const targetFile = path.join(localesDir, `${target}.json`);
        let targetData = {};
        if (fs.existsSync(targetFile)) {
            targetData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        }

        async function traverse(enObj, targetObj) {
            for (const [key, value] of Object.entries(enObj)) {
                if (typeof value === 'object') {
                    targetObj[key] = targetObj[key] || {};
                    await traverse(value, targetObj[key]);
                } else {
                    if (!targetObj[key] || targetObj[key] === '') {
                        console.log(`Translating ${key}: "${value}" -> ${target}`);
                        targetObj[key] = await translate(value, target);
                        await delay(100); // rate limiting
                    }
                }
            }
        }

        await traverse(enData, targetData);
        fs.writeFileSync(targetFile, JSON.stringify(targetData, null, 2));
        console.log(`Wrote ${target}.json`);
    }
}

run().catch(console.error);
