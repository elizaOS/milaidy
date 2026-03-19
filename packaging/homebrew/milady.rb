# frozen_string_literal: true

# Homebrew formula for Milady — personal AI assistant built on elizaOS
# Use this for the tap's Formula/milady.rb entry.
#
# Key fixes from the original:
#   - npm package name is "miladyai"
#   - URL points to correct npm registry path
#   - Added livecheck block for auto-update detection
#   - Added head for --HEAD installs from develop branch

class Milady < Formula
  desc "Personal AI assistant — cute agents for the acceleration"
  homepage "https://github.com/milady-ai/milady"
  url "https://registry.npmjs.org/miladyai/-/miladyai-2.0.0-alpha.76.tgz"
  sha256 "3f3749c0e591547eac1992ae90eb20ccdc10b899dd3b9edce9801ac416e3a60a"
  license "MIT"
  head "https://github.com/milady-ai/milady.git", branch: "develop"

  livecheck do
    url "https://registry.npmjs.org/miladyai"
    regex(/["']version["']:\s*["']([^"']+)["']/i)
  end

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Milady requires Node.js 22+.

      Get started:
        milady start         Start the agent runtime
        milady setup         Run workspace setup
        milady configure     Configuration guidance

      Dashboard: http://localhost:2138
      Docs:      https://docs.milady.ai
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/milady --version")
  end
end
