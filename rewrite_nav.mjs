import fs from 'fs';
import path from 'path';

let navPath = path.join('apps', 'app', 'src', 'components', 'companion', 'CompanionHubNav.tsx');
let nav = fs.readFileSync(navPath, 'utf8');

// Change main flex col -> items-end so labels align right
nav = nav.replace('className="flex flex-col gap-4 items-center"', 'className="flex flex-col gap-4 items-end"');

// Change each flex-col items-center gap-1.5 to flex-row items-center gap-3
nav = nav.replace(/className="flex flex-col items-center gap-1\.5 group"/g, 'className="flex flex-row items-center gap-3 group"');

// Change each span to right aligned text
// text-[9px] font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-center
nav = nav.replace(/className="text-\[9px\] font-bold tracking-widest text-white\/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-center"/g, 'className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right"');

fs.writeFileSync(navPath, nav);
