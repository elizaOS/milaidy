# frozen_string_literal: true

# Homebrew Cask for Milaidy Desktop App
# This cask installs the Electron desktop application.
#
# Usage:
#   brew tap milady-ai/milaidy
#   brew install --cask milaidy
#
# For the CLI only, use the formula instead:
#   brew install milaidy

cask "milaidy" do
  arch arm: "arm64", intel: "x64"

  version "2.0.0-alpha.21"

  on_arm do
    sha256 "PLACEHOLDER_ARM64_SHA256"
    url "https://github.com/milady-ai/milaidy/releases/download/v#{version}/Milaidy-#{version}-arm64.dmg"
  end

  on_intel do
    sha256 "PLACEHOLDER_X64_SHA256"
    url "https://github.com/milady-ai/milaidy/releases/download/v#{version}/Milaidy-#{version}.dmg"
  end

  name "Milaidy"
  desc "Personal AI assistant built on ElizaOS"
  homepage "https://github.com/milady-ai/milaidy"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Milaidy.app"

  zap trash: [
    "~/Library/Application Support/Milaidy",
    "~/Library/Caches/ai.milady.milaidy",
    "~/Library/Caches/ai.milady.milaidy.ShipIt",
    "~/Library/Preferences/ai.milady.milaidy.plist",
    "~/Library/Saved Application State/ai.milady.milaidy.savedState",
    "~/.milaidy",
  ]

  caveats <<~EOS
    Milaidy desktop app has been installed.

    On first launch, you'll be guided through setup to:
    - Choose your agent's name and personality
    - Connect an AI provider (Anthropic, OpenAI, Ollama, etc.)

    The CLI is also available via: brew install milaidy (without --cask)
  EOS
end
