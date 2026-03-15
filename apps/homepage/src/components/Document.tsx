const docs = [
  {
    title: "For Developers",
    description: "Architecture, plugin workflows, API contracts, and contribution standards.",
    href: "/document/developer-guide",
    action: "Open Developer Docs",
  },
  {
    title: "For Users",
    description: "Install, onboarding, wallet permissions, and daily operating playbooks.",
    href: "/document/user-guide",
    action: "Open User Docs",
  },
];

export function Document() {
  return (
    <section id="document" className="relative py-36 bg-dark text-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="mb-16">
          <p className="text-xs font-mono text-brand tracking-[0.2em] uppercase mb-4">
            Documentation
          </p>
          <h2 className="text-5xl md:text-7xl font-black leading-none tracking-tighter uppercase">
            Learn & Build
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {docs.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="group border border-sharp p-8 bg-white/[0.02] hover:bg-white hover:text-dark transition-colors duration-300"
            >
              <h3 className="text-3xl font-black tracking-tighter uppercase mb-4">{item.title}</h3>
              <p className="font-mono text-sm text-white/60 group-hover:text-dark/70 transition-colors duration-300 mb-8">
                {item.description}
              </p>
              <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-brand group-hover:text-dark">
                {item.action}
                <span aria-hidden="true">→</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
