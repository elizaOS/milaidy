# frozen_string_literal: true

# Updated Homebrew formula for the main milady repo's homebrew/ directory.
# Replace homebrew/milaidy.rb with this file.
#
# Key fixes from the original:
#   - npm package name is "miladyai" not "milaidy"
#   - URL points to correct npm registry path
#   - Added livecheck block for auto-update detection
#   - Added head for --HEAD installs from develop branch

class Milaidy < Formula
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
      Milaidy requires Node.js 22+.

      Get started:
        milaidy start        Start the agent runtime
        milaidy setup        Run workspace setup
        milaidy configure    Configuration guidance

      Dashboard: http://localhost:2138
      Docs:      https://docs.milady.ai
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/milaidy --version")
  end
end
