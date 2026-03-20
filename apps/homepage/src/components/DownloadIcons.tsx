import { type ReactNode, useCallback, useEffect, useState } from "react";
import { releaseData } from "../generated/release-data";

const REPO = "milady-ai/milady";

/* ── Inline SVG Icons (self-hosted, no CDN dependency) ────────────── */

function AppleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 12V5.3l9.5-1.3V12h-9.5zm0 .5H21v7.8l-9.5-1.3v-6.5z" />
    </svg>
  );
}

function LinuxIcon() {
  // Simplified Tux penguin silhouette
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 448 512"
      fill="currentColor"
    >
      <path d="M220.8 123.3c1 .5 1.8 1.7 3 1.7 1.1 0 2.8-.4 2.9-1.5.2-1.4-1.9-2.3-3.2-2.9-1.7-.7-3.9-1-5.5-.1-.4.2-.8.7-.6 1.1.3 1.3 2.3 1.1 3.4 1.7zm-21.9 1.7c1.2 0 2-1.2 3-1.7 1.1-.6 3.1-.4 3.5-1.6.2-.4-.2-.9-.6-1.1-1.6-.9-3.8-.6-5.5.1-1.3.6-3.4 1.5-3.2 2.9.1 1 1.8 1.5 2.8 1.4zM420 403.8c-3.6-4-5.3-11.6-7.2-19.7-1.8-8.1-3.9-16.8-10.5-22.4-1.3-1.1-2.6-2.1-4-2.9-1.3-.8-2.7-1.5-4.1-2 9.2-27.3 5.6-54.5-3.7-79.1-11.4-30.1-31.3-56.4-46.5-74.4-17.1-21.5-33.7-41.9-33.4-72C311.1 85.4 315.7 36.6 281.2 12c-7.1-5-15.1-8.2-23.7-9.6-7.4-1.2-15.4-1.2-22.8 0-8.6 1.5-16.6 4.6-23.7 9.6C176.7 36.6 181.3 85.4 181.1 131.3c.3 30.1-16.3 50.5-33.4 72-15.2 18-35.1 44.3-46.5 74.4-9.3 24.6-12.9 51.8-3.7 79.1-1.4.6-2.8 1.2-4.1 2-1.4.8-2.7 1.8-4 2.9-6.6 5.6-8.7 14.3-10.5 22.4-1.9 8.1-3.6 15.7-7.2 19.7-4.5 5-2 12.5 4.4 15.9 6.3 3.4 14.3 4.5 22.2 4.5 7.9 0 15.8-1.1 22.2-4.5 9.2-4.9 11-14.3 17.3-21.9 3.3-4 7.4-6.7 12.4-6.7h56.6c5 0 9.1 2.7 12.4 6.7 6.3 7.6 8.1 17 17.3 21.9 6.4 3.4 14.3 4.5 22.2 4.5s15.9-1.1 22.2-4.5c6.4-3.4 8.9-10.9 4.4-15.9zM223.4 244.7c-21.7 0-39.3-17.6-39.3-39.3s17.6-39.3 39.3-39.3 39.3 17.6 39.3 39.3-17.6 39.3-39.3 39.3z" />
    </svg>
  );
}

function UbuntuIcon() {
  // Ubuntu Circle of Friends logo
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 496 512"
      fill="currentColor"
    >
      <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm52.7 93c8.8-15.2 28.3-20.5 43.5-11.7 15.3 8.8 20.5 28.3 11.7 43.6-8.8 15.2-28.3 20.5-43.5 11.7-15.3-8.9-20.5-28.4-11.7-43.6zM87.4 287.9c-17.6 0-31.9-14.3-31.9-31.9 0-17.6 14.3-31.9 31.9-31.9 17.6 0 31.9 14.3 31.9 31.9 0 17.6-14.3 31.9-31.9 31.9zm28.1 3.1c22.3-17.9 22.4-51.9 0-69.9 8.6-32.8 29.1-60.7 56.5-79.1l23.7 39.6c-51.5 36.3-51.5 112.5 0 148.8L172 370c-27.4-18.3-47.8-46.3-56.5-79zm228.7 131.7c-15.3 8.8-34.7 3.6-43.5-11.7-8.8-15.3-3.6-34.8 11.7-43.6 15.2-8.8 34.7-3.6 43.5 11.7 8.8 15.3 3.6 34.8-11.7 43.6zm.3-69.5c-26.7-10.3-56.1 6.6-60.5 35-5.2 1.4-48.9 14.3-96.7-9.4l22.5-40.3c57 26.5 123.4-11.7 128.9-74.4l46.1.7c-2.3 34.5-17.3 65.5-40.3 88.4zm-5.9-105.3c-5.4-62-71.3-101.2-128.9-74.4l-22.5-40.3c47.9-23.7 91.5-10.8 96.7-9.4 4.4 28.3 33.8 45.3 60.5 35 23.1 22.9 38 53.9 40.2 88.5l-46 .6z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M17.523 15.341a1 1 0 010-2h.001a1 1 0 010 2h-.001zm-11.046 0a1 1 0 010-2h.001a1 1 0 010 2h-.001zm11.405-6.02l1.997-3.46a.416.416 0 00-.152-.567.416.416 0 00-.568.152L17.14 8.95a10.18 10.18 0 00-5.14-1.372 10.18 10.18 0 00-5.14 1.372L4.84 5.446a.416.416 0 00-.568-.152.416.416 0 00-.152.567l1.997 3.46C2.688 11.186.343 14.652 0 18.7h24c-.344-4.048-2.688-7.514-6.118-9.38z" />
    </svg>
  );
}

function IosIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

const iconMap: Record<string, () => ReactNode> = {
  apple: AppleIcon,
  windows: WindowsIcon,
  linux: LinuxIcon,
  ubuntu: UbuntuIcon,
  android: AndroidIcon,
  ios: IosIcon,
  github: GithubIcon,
};

const platformDefs = [
  {
    id: "apple",
    label: "Download from",
    store: "App Store",
    assetId: "macos-arm64",
  },
  {
    id: "windows",
    label: "Download for",
    store: "Windows",
    assetId: "windows-x64",
  },
  { id: "linux", label: "Download for", store: "Linux", assetId: "linux-x64" },
  {
    id: "ubuntu",
    label: "Download for",
    store: "Ubuntu",
    assetId: "linux-deb",
  },
  { id: "android", label: "Coming", store: "Soon", assetId: "" },
  { id: "ios", label: "Coming", store: "Soon", assetId: "" },
  { id: "github", label: "All", store: "Releases", assetId: "github" },
];

type InstallMethod = "shell" | "powershell" | "brew";

const installMethods: { id: InstallMethod; label: string; prefix: string }[] = [
  { id: "shell", label: "Shell", prefix: "$" },
  { id: "powershell", label: "PowerShell", prefix: "PS>" },
  { id: "brew", label: "Brew", prefix: "$" },
];

export function matchAsset(name: string): string | null {
  const n = name.toLowerCase();
  if (/macos.*arm64.*\.dmg$/.test(n)) return "macos-arm64";
  if (/macos.*x64.*\.dmg$/.test(n)) return "macos-x64";
  if (/setup.*\.exe$/.test(n) || /win.*\.exe$/.test(n)) return "windows-x64";
  if (/win.*setup.*\.zip$/.test(n)) return "windows-x64";
  if (/linux.*\.deb$/.test(n)) return "linux-deb";
  if (/linux.*\.appimage$/.test(n)) return "linux-x64";
  if (/linux.*\.tar\.gz$/.test(n)) return "linux-x64";
  return null;
}

function buildStaticUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const d of releaseData.release.downloads) {
    urls[d.id] = d.url;
  }
  return urls;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function DownloadIcons() {
  const [urls, setUrls] = useState<Record<string, string>>(buildStaticUrls);
  const [releasePageUrl, setReleasePageUrl] = useState<string>(
    releaseData.release.url,
  );
  const [activeMethod, setActiveMethod] = useState<InstallMethod>("shell");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (
          releases: Array<{
            draft: boolean;
            html_url: string;
            assets: Array<{ name: string; browser_download_url: string }>;
          }>,
        ) => {
          const release = releases.find((r) => !r.draft && r.assets.length > 0);
          if (!release) return;

          setReleasePageUrl(release.html_url);

          const freshUrls: Record<string, string> = {};
          for (const asset of release.assets) {
            const id = matchAsset(asset.name);
            if (id && !freshUrls[id]) {
              freshUrls[id] = asset.browser_download_url;
            }
          }
          setUrls(freshUrls);
        },
      )
      .catch(() => {
        // Silently fall back to build-time data
      });
  }, []);

  function getUrl(assetId: string): string {
    if (!assetId) return "#";
    if (assetId === "github") return releasePageUrl;
    return urls[assetId] ?? releasePageUrl;
  }

  const getCommand = useCallback((method: InstallMethod): string => {
    switch (method) {
      case "shell":
        return releaseData.scripts.shell.command;
      case "powershell":
        return releaseData.scripts.powershell.command;
      case "brew":
        return "brew install milady-ai/tap/milady";
      default:
        return releaseData.scripts.shell.command;
    }
  }, []);

  function getPrefix(method: InstallMethod): string {
    return installMethods.find((m) => m.id === method)?.prefix ?? "$";
  }

  const copyToClipboard = useCallback(() => {
    const command = getCommand(activeMethod);
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeMethod, getCommand]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Platform download icons — white bg hover style */}
      <ul className="download-icons">
        {platformDefs.map((p) => {
          const url = getUrl(p.assetId);
          const disabled = url === "#";
          const Icon = iconMap[p.id];
          return (
            <li key={p.id}>
              <a
                href={url}
                target={disabled ? undefined : "_blank"}
                rel={disabled ? undefined : "noreferrer"}
                className={`download ${p.id}${disabled ? " is-disabled" : ""}`}
                title={p.store}
                onClick={disabled ? (e) => e.preventDefault() : undefined}
              >
                {Icon && <Icon />}
                <span className="df">{p.label}</span>
                <span className="dfn">{p.store}</span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Install commands — terminal style */}
      <div className="w-full max-w-xl">
        {/* Terminal window */}
        <div className="bg-[#0a0a0c] border border-brand/20 overflow-hidden">
          {/* Terminal chrome with tabs */}
          <div className="flex items-center bg-[#111114] border-b border-brand/10">
            {/* Window controls */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-r border-brand/10">
              <span className="w-2 h-2 rounded-full bg-red-500/70" />
              <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
              <span className="w-2 h-2 rounded-full bg-green-500/70" />
            </div>

            {/* Method tabs — terminal style */}
            <div className="flex items-center">
              {installMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setActiveMethod(method.id)}
                  className={`px-4 py-2.5 font-mono text-[10px] tracking-wider uppercase transition-all duration-150 border-r border-brand/10
                    ${
                      activeMethod === method.id
                        ? "text-brand bg-[#0a0a0c]"
                        : "text-text-subtle hover:text-text-light hover:bg-[#0d0d10]"
                    }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Command area */}
          <div className="relative px-4 py-4 bg-[#08080a]">
            <code className="block font-mono text-[10px] sm:text-[11px] text-brand select-all cursor-text break-all sm:break-normal pr-10">
              <span className="text-text-subtle mr-2">
                {getPrefix(activeMethod)}
              </span>
              {getCommand(activeMethod)}
            </code>

            {/* Copy button */}
            <button
              type="button"
              onClick={copyToClipboard}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 transition-all duration-150 border border-transparent
                ${
                  copied
                    ? "text-green-400"
                    : "text-text-subtle hover:text-brand hover:border-brand/30 hover:bg-brand/5"
                }`}
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              {copied ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <CopyIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
