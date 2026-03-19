export function Comparison() {
  const categories = [
    {
      feature: "Execution Environment",
      milady: "Desktop + CLI",
      openclaw: "Browser Tab + SaaS",
      miladySub:
        "Run the agent runtime on your machine and keep control of the process boundary.",
      openclawSub:
        "Execution lives in somebody else’s backend and disappears when their service does.",
    },
    {
      feature: "Privacy & Data",
      milady: "Zero Telemetry",
      openclaw: "Cloud Logging",
      miladySub:
        "Conversations, local files, and model wiring stay on infrastructure you own.",
      openclawSub:
        "Requests, prompts, and attachments move through hosted infrastructure by default.",
    },
    {
      feature: "Model Choice",
      milady: "Provider Agnostic",
      openclaw: "Single Vendor Bias",
      miladySub:
        "Swap between OpenAI, Anthropic, Google, Ollama, and local stacks without rewriting the app.",
      openclawSub:
        "Feature velocity depends on the one model vendor the product team chose for you.",
    },
    {
      feature: "Autonomy",
      milady: "Runtime + Tools",
      openclaw: "Prompt Box",
      miladySub:
        "Sessions, tools, hooks, plugins, and long-running workflows are first-class runtime concerns.",
      openclawSub: "Most automation stops where chat UX stops.",
    },
    {
      feature: "Distribution",
      milady: "GitHub Releases + Scripts",
      openclaw: "Opaque Auto-Updates",
      miladySub:
        "Desktop artifacts, checksums, and installer scripts stay inspectable in public release history.",
      openclawSub:
        "Update channels and binaries are often hidden behind proprietary delivery systems.",
    },
    {
      feature: "Extensibility",
      milady: "Plugins + Wallets",
      openclaw: "Limited Integrations",
      miladySub:
        "Bring your own providers, plugins, wallets, and transport layers into the same runtime.",
      openclawSub:
        "Integration depth is gated by product roadmap instead of local ownership.",
    },
  ];

  return (
    <section
      id="comparison"
      className="relative py-24 sm:py-32 lg:py-48 bg-transparent text-text-light overflow-hidden"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12 relative z-10">
        <div className="mb-16 sm:mb-24 lg:mb-32">
          <p className="text-[10px] sm:text-xs font-mono text-white/50 tracking-[0.2em] uppercase mb-4 sm:mb-6 flex items-center gap-3 sm:gap-4">
            <span className="w-6 sm:w-8 h-[1px] bg-white/40" />
            Control Surface
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter uppercase">
            Milady <br />
            <span className="text-white/40">VS Hosted Assistants</span>
          </h2>
        </div>

        <div className="space-y-10 sm:space-y-14 lg:space-y-24">
          {categories.map((row) => (
            <div
              key={row.feature}
              className="flex flex-col gap-5 sm:gap-6 md:gap-10 group border-t border-white/5 pt-6 sm:pt-8 lg:pt-12"
            >
              <div className="w-full md:w-1/4">
                <h3 className="font-mono text-[10px] sm:text-xs text-brand tracking-[0.2em] uppercase">
                  {row.feature}
                </h3>
              </div>

              <div className="w-full grid gap-5 sm:gap-6 sm:grid-cols-2 md:gap-8">
                <div className="rounded-2xl border border-brand/10 bg-brand/[0.03] p-4 sm:p-5 lg:p-6">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-2 h-2 bg-brand" />
                    <span className="font-black text-lg sm:text-2xl lg:text-3xl uppercase tracking-tighter text-white">
                      {row.milady}
                    </span>
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-white/90 leading-relaxed">
                    {row.miladySub}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5 lg:p-6 opacity-85 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-2 h-2 bg-white/60" />
                    <span className="font-medium text-base sm:text-xl lg:text-2xl uppercase tracking-tighter text-white/90 line-through decoration-brand/50">
                      {row.openclaw}
                    </span>
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-white/70 leading-relaxed">
                    {row.openclawSub}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
