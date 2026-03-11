import fs from 'fs';

const file = 'apps/app/src/components/companion/CompanionHeader.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('lucide-react')) {
  content = content.replace(
    'import { LanguageDropdown } from "../shared/LanguageDropdown";',
    'import { LanguageDropdown } from "../shared/LanguageDropdown";\nimport { MessageSquare, Menu, Loader2, Play, Pause, RefreshCw, Coins, Maximize } from "lucide-react";'
  );
}

const chatSvg = `<svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>`;
content = content.replace(chatSvg, '<MessageSquare className="w-5 h-5" />');

const menuSvg = `<svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>`;
content = content.replace(menuSvg, '<Menu className="w-[18px] h-[18px]" />');

const spinner14 = `<svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>`;
content = content.replace(spinner14, '<Loader2 className="w-3.5 h-3.5 animate-spin" />');

const spinner12 = `<svg
                    className="animate-spin"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>`;
content = content.replaceAll(spinner12, '<Loader2 className="w-3 h-3 animate-spin" />');

const playSvg = `<svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>`;
content = content.replace(playSvg, '<Play className="w-3 h-3 fill-current" />');

const pauseSvg = `<svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>`;
content = content.replace(pauseSvg, '<Pause className="w-3 h-3 fill-current" />');

const refreshSvg = `<svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>`;
content = content.replace(refreshSvg, '<RefreshCw className="w-3 h-3" />');

const coinsSvg = `<svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>`;
content = content.replace(coinsSvg, '<Coins className="w-3 h-3" />');

const maxSvg = `<svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <line x1="8" y1="20" x2="16" y2="20" />
              <line x1="12" y1="18" x2="12" y2="20" />
            </svg>`;
content = content.replace(maxSvg, '<Maximize className="w-4 h-4" />');

fs.writeFileSync(file, content);
console.log("Replacements complete");
