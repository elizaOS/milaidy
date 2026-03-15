const features = [
  {
    title: "Unified Message Bus",
    description: "One event pipeline for every interface — Discord, Telegram, X, HTTP or onchain. Ship your agent once; swap transport adapters without touching business logic.",
  },
  {
    title: "Composable Swarms",
    description: "Leverage Worlds (server/workspace) and Rooms (channel/DMs) so each agent keeps its own context yet can signal others, enabling delegation, consensus and load-balancing.",
  },
  {
    title: "Strategic Action Chaining",
    description: "LLM-driven tool calls enable advanced workflows: branch or schedule actions; run steps in parallel or pause for user input. Real operations, not just chat replies.",
  },
  {
    title: "Modular Open-Source",
    description: "Every capability—model provider, vector store, social network, custom action—arrives as an npm plugin. Hot-swap at runtime, stay clear of vendor lock-in.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-48 bg-dark text-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="mb-32 text-center">
          <p className="text-xs font-mono text-brand tracking-[0.2em] uppercase mb-4">
            Architecture
          </p>
          <h2 className="text-5xl md:text-7xl font-black leading-none tracking-tighter uppercase">
            Core Modules
          </h2>
        </div>

        <div className="space-y-32 md:space-y-48">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`flex flex-col ${i % 2 === 0 ? 'items-start text-left' : 'items-end text-right'}`}
            >
              <div className="max-w-3xl group">
                <h3 className="text-4xl md:text-6xl font-black mb-8 uppercase tracking-tighter text-white group-hover:text-brand transition-colors duration-500">{feature.title}</h3>
                <p className="text-xl md:text-2xl text-white/50 font-mono leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
