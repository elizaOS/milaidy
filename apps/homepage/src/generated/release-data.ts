export const releaseData = {
  generatedAt: "2026-03-19T12:05:53.328Z",
  scripts: {
    shell: {
      url: "https://milady.ai/install.sh",
      command: "curl -fsSL https://milady.ai/install.sh | bash",
    },
    powershell: {
      url: "https://milady.ai/install.ps1",
      command: "irm https://milady.ai/install.ps1 | iex",
    },
  },
  release: {
    tagName: "v2.0.0-alpha.99",
    publishedAtLabel: "Mar 19, 2026",
    prerelease: true,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.99",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "canary-macos-arm64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.99/canary-macos-arm64-Milady-canary.dmg",
        sizeLabel: "576.3 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "canary-macos-x64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.99/canary-macos-x64-Milady-canary.dmg",
        sizeLabel: "589.0 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-canary.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.99/Milady-Setup-canary.exe",
        sizeLabel: "679.4 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "canary-linux-x64-Milady-canary-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.99/canary-linux-x64-Milady-canary-Setup.tar.gz",
        sizeLabel: "641.1 MB",
        note: "tar.gz package",
      },
    ],
    checksum: {
      fileName: "SHA256SUMS.txt",
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.99/SHA256SUMS.txt",
    },
  },
} as const;
