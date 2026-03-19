const features = [
  {
    title: "Desktop + CLI",
    description:
      "One interface, two surfaces. Desktop app for daily use, CLI for automation and scripting. Same capabilities, your preferred workflow.",
  },
  {
    title: "Any Model",
    description:
      "OpenAI, Anthropic, Google, Ollama, or local inference. Swap providers without changing your setup. The interface stays consistent.",
  },
  {
    title: "Extensible",
    description:
      "Plugins, providers, wallets, and automation hooks. Build on top of Milady or connect it to your existing tools.",
  },
  {
    title: "Open Source",
    description:
      "Public releases, inspectable builds, transparent development. Fork it, audit it, contribute to it.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="relative py-24 sm:py-32 lg:py-48 bg-dark text-white overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12">
        <div className="mb-16 sm:mb-24 lg:mb-32 text-center">
          <p className="text-[10px] sm:text-xs font-mono text-brand tracking-[0.2em] uppercase mb-3 sm:mb-4">
            Capabilities
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black leading-none tracking-tighter uppercase">
            Built for Real Work
          </h2>
        </div>

        <div className="space-y-14 sm:space-y-20 md:space-y-32 lg:space-y-48">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`flex flex-col ${i % 2 === 0 ? "items-start text-left" : "items-start sm:items-end sm:text-right text-left"}`}
            >
              <div className="max-w-3xl group">
                <h3 className="text-3xl sm:text-4xl md:text-6xl font-black mb-4 sm:mb-6 lg:mb-8 uppercase tracking-tighter text-white group-hover:text-brand transition-colors duration-500">
                  {feature.title}
                </h3>
                <p className="text-base sm:text-lg md:text-2xl text-white/55 font-mono leading-relaxed max-w-2xl">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
