# frozen_string_literal: true

# Homebrew formula for Milady CLI
# This formula installs the Node.js-based CLI tool via npm.
#
# Usage:
#   brew tap milady-ai/milady
#   brew install milady
#
# For the desktop app, use the cask instead:
#   brew install --cask milady

class Milady < Formula
  desc "Personal AI assistant built on ElizaOS"
  homepage "https://github.com/milady-ai/milady"
  url "https://registry.npmjs.org/milady/-/milady-2.0.0-alpha.21.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Milady requires Node.js 22+.

      To start the agent:
        milady start

      To configure:
        milady setup

      Dashboard will be available at http://localhost:2138
    EOS
  end

  test do
    assert_match "milady", shell_output("#{bin}/milady --version")
  end
end
