import fs from 'fs';
import path from 'path';

let navPath = path.join('apps', 'app', 'src', 'components', 'companion', 'CompanionHubNav.tsx');
let nav = fs.readFileSync(navPath, 'utf8');

// Change each flex-row to flex-row-reverse to swap the visual order (label to the left of the button)
nav = nav.replace(/className="flex flex-row items-center gap-3 group"/g, 'className="flex flex-row-reverse items-center gap-3 group"');

fs.writeFileSync(navPath, nav);
