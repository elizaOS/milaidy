export const releaseData = {
  generatedAt: "2026-03-18T06:46:22.061Z",
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
    tagName: "v2.0.0-alpha.87",
    publishedAtLabel: "Mar 15, 2026",
    prerelease: true,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.87",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "canary-macos-arm64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.87/canary-macos-arm64-Milady-canary.dmg",
        sizeLabel: "567.5 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "canary-macos-x64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.87/canary-macos-x64-Milady-canary.dmg",
        sizeLabel: "579.9 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-canary.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.87/Milady-Setup-canary.exe",
        sizeLabel: "415.0 KB",
        note: "Release asset",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "canary-linux-x64-Milady-canary-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.87/canary-linux-x64-Milady-canary-Setup.tar.gz",
        sizeLabel: "637.0 MB",
        note: "tar.gz package",
      },
    ],
    checksum: {
      fileName: "SHA256SUMS.txt",
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.87/SHA256SUMS.txt",
    },
  },
} as const;
