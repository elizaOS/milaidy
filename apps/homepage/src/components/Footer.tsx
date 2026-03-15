export function Footer() {
  return (
    <footer className="pt-24 pb-8 px-6 md:px-12 bg-dark border-t border-sharp overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-20">
          <div>
            <span className="text-3xl font-black tracking-tighter uppercase flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-brand"></span>
              MILADY
            </span>
            <p className="text-sm text-text-muted mt-4 max-w-xs font-mono">
              Your local AI companion, natively on BSC.
            </p>
          </div>

          <div className="flex gap-6">
            <SocialLink href="https://github.com/milady-ai/milady" label="GitHub" >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </SocialLink>
            <SocialLink href="https://x.com/milady_bsc" label="X">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </SocialLink>
          </div>
        </div>

        {/* MASSIVE TYPOGRAPHY */}
        <div className="relative text-center w-full overflow-hidden select-none mb-12 border-t border-b border-sharp py-8 flex justify-center">
          <h1 className="text-[12vw] font-black leading-none tracking-tighter text-text-light/10 uppercase whitespace-nowrap">
            MILADY APP
          </h1>

          {/* Hidden characters — only visible on hover */}
          <img
            src="/black-asset-1.png"
            alt=""
            draggable={false}
            className="absolute left-0 bottom-0 w-36 h-44 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
          <img
            src="/black-asset-2.png"
            alt=""
            draggable={false}
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-36 h-44 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
          <img
            src="/black-asset-3.png"
            alt=""
            draggable={false}
            className="absolute right-0 bottom-0 w-36 h-44 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
        </div>

        <div className="text-center">
          <p className="text-xs font-mono text-text-muted uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Milady. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="text-text-muted hover:text-brand transition-colors duration-300 transform hover:scale-110"
    >
      {children}
    </a>
  );
}
