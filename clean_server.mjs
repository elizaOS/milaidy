import fs from 'fs';

let content = fs.readFileSync('src/api/server.ts', 'utf8');

// The file has <<<<<<< HEAD, =======, >>>>>>> markers
// We just want to KEEP the HEAD version of all conflicts.
// The regex finds <<<<<<< HEAD\n(HEAD CONTENT)=======\n(THEIRS CONTENT)>>>>>>> [branch]\n
const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*\n/g;

content = content.replace(conflictRegex, '$1');

// Ensure proof is fixed
content = content.replace(
    /endpoint,\n\s*body\.proof,/,
    `endpoint,\n      proof,`
);

fs.writeFileSync('src/api/server.ts', content);
console.log("Removed conflict markers from server.ts and kept HEAD version.");
