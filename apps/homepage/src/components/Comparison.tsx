export function Comparison() {
  const categories = [
    {
      feature: "Where It Runs",
      milady: "Desktop + CLI",
      other: "Browser Only",
      miladySub:
        "Native app with full system access. Run automations, access local files, integrate with your tools.",
      otherSub:
        "Limited to what browsers allow. Sandboxed from your system and workflows.",
    },
    {
      feature: "Model Choice",
      milady: "Any Provider",
      other: "Fixed Provider",
      miladySub:
        "OpenAI, Anthropic, Google, Ollama, local models. Switch freely, keep your setup.",
      otherSub:
        "Locked to one vendor's API. Pricing and capabilities tied to their roadmap.",
    },
    {
      feature: "Your Data",
      milady: "You Decide",
      other: "Their Servers",
      miladySub:
        "Local processing when you want it. Cloud when you need it. Transparent either way.",
      otherSub:
        "Everything routes through hosted infrastructure by default.",
    },
    {
      feature: "Automation",
      milady: "Full Runtime",
      other: "Chat Interface",
      miladySub:
        "Plugins, workflows, scheduled tasks, system integrations. Real automation.",
      otherSub:
        "Interaction stops at the chat window. Limited extension points.",
    },
    {
      feature: "Updates",
      milady: "Public Releases",
      other: "Silent Updates",
      miladySub:
        "GitHub releases with changelogs. Inspect diffs, verify builds, control when you update.",
      otherSub:
        "Updates happen in the background. You get what they ship.",
    },
    {
      feature: "Extensibility",
      milady: "Open Plugin System",
      other: "Closed Ecosystem",
      miladySub:
        "Build your own plugins, providers, and integrations. Extend anything.",
      otherSub:
        "Limited to official integrations. Extension points gated by platform.",
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
            Why Milady
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter uppercase">
            The <br />
            <span className="text-white/40">Difference</span>
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

                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5 lg:p-6 opacity-70 transition-opacity duration-300 group-hover:opacity-90">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-2 h-2 bg-white/40" />
                    <span className="font-medium text-base sm:text-xl lg:text-2xl uppercase tracking-tighter text-white/70">
                      {row.other}
                    </span>
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-white/50 leading-relaxed">
                    {row.otherSub}
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
