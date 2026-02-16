# Homebrew formula for Milady — personal AI assistant built on ElizaOS
#
# Installation:
#   brew tap milady-ai/tap
#   brew install milady
#
# Or direct:
#   brew install milady-ai/tap/milady

class Milady < Formula
  desc "Personal AI assistant built on ElizaOS — cute agents for the acceleration"
  homepage "https://milady.ai"
  url "https://registry.npmjs.org/milady/-/milady-2.0.0-alpha.6.tgz"
  sha256 "d0da83506fc528ab7f3b4d9b1e44aaec2761005aac874ca2478c37444e8ae6e5"
  license "MIT"

  # Semantic versioning — tracks stable releases
  livecheck do
    url "https://registry.npmjs.org/milady"
    regex(/["']version["']:\s*["']([^"']+)["']/i)
  end

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    ohai "Milady installed! Run 'milady start' to begin."
    ohai "First run will walk you through interactive setup."
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/milady --version").strip
    assert_match "milady", shell_output("#{bin}/milady --help")
  end
end
