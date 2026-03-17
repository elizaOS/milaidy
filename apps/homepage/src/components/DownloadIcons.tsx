import { useEffect, useState } from "react";
import { releaseData } from "../generated/release-data";

const REPO = "milady-ai/milady";

const platformDefs = [
  { id: "apple", icon: "fa-brands fa-apple", label: "Download from", store: "App Store", assetId: "macos-arm64" },
  { id: "windows", icon: "fa-brands fa-windows", label: "Download for", store: "Windows", assetId: "windows-x64" },
  { id: "linux", icon: "fa-brands fa-linux", label: "Download for", store: "Linux", assetId: "linux-x64" },
  { id: "ubuntu", icon: "fa-brands fa-ubuntu", label: "Download for", store: "Ubuntu", assetId: "linux-deb" },
  { id: "android", icon: "fa-brands fa-android", label: "Coming", store: "Soon", assetId: "" },
  { id: "ios", icon: "fa-brands fa-app-store-ios", label: "Coming", store: "Soon", assetId: "" },
  { id: "github", icon: "fa-brands fa-github", label: "All", store: "Releases", assetId: "github" },
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
  const [releasePageUrl, setReleasePageUrl] = useState<string>(releaseData.release.url);

  useEffect(() => {
    // Fetch latest release with assets at runtime to stay current
    fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((releases: Array<{ draft: boolean; html_url: string; assets: Array<{ name: string; browser_download_url: string }> }>) => {
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
      })
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
                <i className={p.icon} />
                <span className="df">{p.label}</span>
                <span className="dfn">{p.store}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-center gap-2 font-mono text-[9px] sm:text-[11px] text-brand w-full max-w-[90vw] sm:max-w-none">
        <code className="px-2 sm:px-3 py-1.5 border border-brand/30 bg-brand/5 select-all cursor-text break-all sm:break-normal">
          {releaseData.scripts.shell.command}
        </code>
        <code className="px-2 sm:px-3 py-1.5 border border-brand/30 bg-brand/5 select-all cursor-text break-all sm:break-normal">
          {releaseData.scripts.powershell.command}
        </code>
      </div>
    </div>
  );
}
