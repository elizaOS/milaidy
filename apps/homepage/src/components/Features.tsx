const features = [
  {
    title: "Desktop + CLI",
    description:
      "The same Milady runtime ships as a desktop app and a CLI workflow, so install paths stay simple and capabilities do not fork by surface.",
  },
  {
    title: "Model Flexibility",
    description:
      "Wire OpenAI, Anthropic, Google, Ollama, and local providers into one runtime instead of rebuilding the app around a single hosted model.",
  },
  {
    title: "Plugin Runtime",
    description:
      "Providers, skills, wallets, transports, and automation hooks stay composable so the homepage can advertise the real system instead of a thin chat shell.",
  },
  {
    title: "Inspectability",
    description:
      "Releases, installer scripts, checksums, and source all live in public Git history. Users can inspect exactly what gets shipped.",
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
            Runtime Surface
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black leading-none tracking-tighter uppercase">
            What You Actually Get
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
