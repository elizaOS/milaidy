import { releaseData } from "../generated/release-data";

export function Footer() {
  return (
    <footer className="relative pt-24 pb-12 px-6 md:px-12 bg-dark border-t border-sharp overflow-hidden">
      {/* Background — massive MILADY APP text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <h1 className="text-[18vw] font-black leading-none tracking-tighter text-white/[0.04] uppercase whitespace-nowrap">
          MILADY APP
        </h1>
      </div>

      {/* Foreground content — overlays the background text */}
      <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center gap-10">
        {/* Logo + description */}
        <div className="text-center">
          <span className="text-3xl font-black tracking-tighter uppercase inline-flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-brand" />
            MILADY
          </span>
          <p className="text-sm text-text-muted mt-4 max-w-md font-mono mx-auto">
            Local-first agent runtime with desktop releases, CLI install
            scripts, and public GitHub artifacts.
          </p>
        </div>

        {/* Social links */}
        <div className="flex gap-6">
          <SocialLink
            href="https://github.com/milady-ai/milady"
            label="GitHub"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <title>GitHub</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </SocialLink>
          <SocialLink href={releaseData.release.url} label="Releases">
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <title>Releases</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V4.5m0 12 4.5-4.5M12 16.5 7.5 12M4.5 19.5h15"
              />
            </svg>
          </SocialLink>
          <SocialLink href="https://discord.gg/milady" label="Discord">
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Discord</title>
              <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.344-.404.804-.553 1.17a18.27 18.27 0 0 0-5.29 0A12.64 12.64 0 0 0 9.49 3a19.736 19.736 0 0 0-4.433 1.369C2.252 8.555 1.489 12.638 1.87 16.664a19.99 19.99 0 0 0 5.45 2.79c.44-.6.832-1.235 1.17-1.902-.644-.24-1.257-.536-1.84-.88.153-.113.303-.23.446-.35 3.548 1.657 7.39 1.657 10.896 0 .145.12.295.237.447.35-.585.345-1.2.642-1.845.882.338.666.73 1.301 1.17 1.902a19.96 19.96 0 0 0 5.452-2.79c.446-4.663-.762-8.709-3.635-12.295ZM8.02 14.248c-1.06 0-1.932-.978-1.932-2.18 0-1.203.85-2.181 1.932-2.181 1.09 0 1.95.988 1.932 2.18 0 1.203-.85 2.181-1.932 2.181Zm7.96 0c-1.06 0-1.931-.978-1.931-2.18 0-1.203.849-2.181 1.931-2.181 1.09 0 1.95.988 1.932 2.18 0 1.203-.842 2.181-1.932 2.181Z" />
            </svg>
          </SocialLink>
        </div>

        {/* Hidden characters — only visible on hover */}
        <div className="relative w-full h-0">
          <img
            src="/black-asset-1.png"
            alt=""
            draggable={false}
            className="absolute left-4 bottom-0 w-28 h-36 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
          <img
            src="/black-asset-2.png"
            alt=""
            draggable={false}
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-28 h-36 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
          <img
            src="/black-asset-3.png"
            alt=""
            draggable={false}
            className="absolute right-4 bottom-0 w-28 h-36 object-contain object-bottom opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto select-none"
          />
        </div>

        {/* Copyright */}
        <p className="text-xs font-mono text-text-muted uppercase tracking-widest text-center">
          &copy; {new Date().getFullYear()} Milady. Latest surfaced release:{" "}
          {releaseData.release.tagName}.
        </p>
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
