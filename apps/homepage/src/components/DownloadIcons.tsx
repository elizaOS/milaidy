import { type ReactNode, useEffect, useState } from "react";
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
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2a3.4 3.4 0 00.114.333c.391.778 1.113 1.396 1.884 1.564.422.074.852-.002 1.278-.29.19-.13.363-.295.528-.525.39-.546.981-1.3 1.006-2.34.034-.46-.04-.87-.233-1.27a2 2 0 00-.13-.262c.009-.02.018-.042.027-.064.135-.327.191-.672.186-1.004-.01-.667-.311-1.321-.656-1.862-.388-.567-.852-1.079-1.186-1.625-.334-.546-.514-1.134-.394-1.893.202-1.283.545-2.57.353-3.822-.116-.752-.398-1.493-.876-2.104-.46-.588-1.093-1.037-1.86-1.211a4.1 4.1 0 00-1.464-.074c-.511.054-1.052.176-1.622.367z" />
    </svg>
  );
}

function UbuntuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM5.5 14a2 2 0 110-4 2 2 0 010 4zm13 0a2 2 0 110-4 2 2 0 010 4zM12 19.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
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

export function DownloadIcons() {
  const [urls, setUrls] = useState<Record<string, string>>(buildStaticUrls);
  const [releasePageUrl, setReleasePageUrl] = useState<string>(
    releaseData.release.url,
  );

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

  return (
    <div className="flex flex-col items-center gap-6">
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

      <div className="flex w-full max-w-sm flex-col items-center gap-2 font-mono text-[9px] sm:max-w-none sm:text-[11px] text-brand">
        <code className="w-full px-3 sm:px-3 py-2 border border-brand/30 bg-brand/5 select-all cursor-text whitespace-pre-wrap break-all rounded-md text-center leading-relaxed sm:w-auto sm:text-left sm:whitespace-normal sm:break-normal">
          {releaseData.scripts.shell.command}
        </code>
        <code className="w-full px-3 sm:px-3 py-2 border border-brand/30 bg-brand/5 select-all cursor-text whitespace-pre-wrap break-all rounded-md text-center leading-relaxed sm:w-auto sm:text-left sm:whitespace-normal sm:break-normal">
          {releaseData.scripts.powershell.command}
        </code>
      </div>
    </div>
  );
}
