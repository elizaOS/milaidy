import fs from 'fs';

const file = 'apps/app/src/components/companion/CompanionHeader.tsx';
let content = fs.readFileSync(file, 'utf8');

// Container & positioning
content = content.replace(
  'className="anime-comp-header"', 
  'className="relative flex justify-center items-center mb-6 w-full z-10"'
);

content = content.replace(
  'className="anime-comp-header-left"', 
  'className="absolute left-0 flex items-center gap-4"'
);

// Toggle button
content = content.replace(
  /className=\{`anime-btn-ghost anime-chat-toggle-btn \$\{chatDockOpen \? [\s\S]*?\}/,
  '`className={\`flex items-center justify-center p-2.5 rounded-full backdrop-blur-md transition-all duration-300 ease-out border shadow-lg ${chatDockOpen ? "bg-white/10 border-sky-400/50 shadow-[0_0_15px_rgba(56,189,248,0.3)] text-sky-300 translate-y-px" : "bg-black/30 border-white/10 text-white/80 hover:bg-white/15 hover:border-white/30 hover:text-white hover:-translate-y-0.5"}\`}`'
);

// Pill groupings
content = content.replace(
  'className="anime-header-extensions"', 
  'className="flex items-center gap-3 relative"'
);

// Paws/Restart Pills
content = content.replace(
  /<div className="anime-header-pill">/g, 
  '<div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all shadow-inner relative overflow-hidden group">'
);
content = content.replace(
  /className=\{`anime-header-pill is-clickable([\s\S]*?)`\}/g, 
  '`className={\`flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] font-medium text-sm tracking-wide transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 cursor-pointer ${cloudCredits === null ? "text-white/60" : creditColor}\`}`'
);

content = content.replace(
  /<span className="anime-header-pill is-danger">/g, 
  '<span className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-red-950/40 backdrop-blur-xl border border-red-500/30 text-red-400 font-medium text-sm tracking-wide shadow-[0_8px_32px_rgba(220,38,38,0.15)]">'
);

content = content.replace(
  /<span className="anime-header-pill"/g, 
  '<span className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all"'
);


// Pill inner text / icons
content = content.replace(
  /className=\{`anime-header-pill-text \$\{stateColor\}`\}/g,
  '`className={\`uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md ${stateColor}\`}`'
);
content = content.replace(
  /<span className="anime-header-pill-text">/g,
  '<span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">'
);

content = content.replace(
  /className="anime-header-pill-icon opacity-60"/g,
  'className="flex items-center justify-center opacity-60 ml-1.5"'
);

// Actions in Pill
content = content.replace(
  /className=\{`anime-header-action-btn([\s\S]*?)`\}/g,
  '`className={\`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${pauseResumeDisabled || lifecycleBusy || agentState === "restarting" ? "opacity-30 cursor-not-allowed bg-transparent" : "bg-white/5 hover:bg-white/20 hover:scale-110 border border-transparent hover:border-white/30 cursor-pointer"}\`}`'
);

// Right Side
content = content.replace(
  'className="anime-comp-header-right"', 
  'className="absolute right-0 flex items-center gap-2.5"'
);

content = content.replace(
  'className="anime-character-header-control"', 
  'className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-1.5 py-1.5 backdrop-blur-xl shadow-xl hover:border-white/20 transition-all"'
);

content = content.replace(
  'className="anime-roster-config-btn"', 
  'className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all"'
);


fs.writeFileSync(file, content);
console.log("Tailwind replacements applied to CompanionHeader.tsx");
