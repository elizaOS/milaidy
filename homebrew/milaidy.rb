# frozen_string_literal: true

# Homebrew formula for Milaidy CLI
# This formula installs the Node.js-based CLI tool via npm.
#
# Usage:
#   brew tap milady-ai/milaidy
#   brew install milaidy
#
# For the desktop app, use the cask instead:
#   brew install --cask milaidy

class Milaidy < Formula
  desc "Personal AI assistant built on ElizaOS"
  homepage "https://github.com/milady-ai/milaidy"
  url "https://registry.npmjs.org/milaidy/-/milaidy-2.0.0-alpha.21.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Milaidy requires Node.js 22+.

      To start the agent:
        milaidy start

      To configure:
        milaidy setup

      Dashboard will be available at http://localhost:2138
    EOS
  end

  test do
    assert_match "milaidy", shell_output("#{bin}/milaidy --version")
  end
end
