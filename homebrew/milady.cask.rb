# frozen_string_literal: true

# Homebrew Cask for Milady Desktop App
# This cask installs the Electron desktop application.
#
# Usage:
#   brew tap milady-ai/milady
#   brew install --cask milady
#
# For the CLI only, use the formula instead:
#   brew install milady

cask "milady" do
  arch arm: "arm64", intel: "x64"

  version "2.0.0-alpha.21"

  on_arm do
    sha256 "PLACEHOLDER_ARM64_SHA256"
    url "https://github.com/milady-ai/milady/releases/download/v#{version}/Milady-#{version}-arm64.dmg"
  end

  on_intel do
    sha256 "PLACEHOLDER_X64_SHA256"
    url "https://github.com/milady-ai/milady/releases/download/v#{version}/Milady-#{version}.dmg"
  end

  name "Milady"
  desc "Personal AI assistant built on ElizaOS"
  homepage "https://github.com/milady-ai/milady"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Milady.app"

  zap trash: [
    "~/Library/Application Support/Milady",
    "~/Library/Caches/ai.milady.milady",
    "~/Library/Caches/ai.milady.milady.ShipIt",
    "~/Library/Preferences/ai.milady.milady.plist",
    "~/Library/Saved Application State/ai.milady.milady.savedState",
    "~/.milady",
  ]

  caveats <<~EOS
    Milady desktop app has been installed.

    On first launch, you'll be guided through setup to:
    - Choose your agent's name and personality
    - Connect an AI provider (Anthropic, OpenAI, Ollama, etc.)

    The CLI is also available via: brew install milady (without --cask)
  EOS
end
