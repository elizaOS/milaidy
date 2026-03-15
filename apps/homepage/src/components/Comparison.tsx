export function Comparison() {
    const categories = [
        {
            feature: "Execution Environment",
            milady: "100% Local (macOS/Windows)",
            openclaw: "Cloud Dependent (API)",
            miladySub: "Zero latency. No cloud downtime.",
            openclawSub: "Subject to rate limits and outages.",
        },
        {
            feature: "Privacy & Data",
            milady: "Zero Telemetry",
            openclaw: "Data Collection & Tracking",
            miladySub: "Absolute privacy. Your chats never leave your device.",
            openclawSub: "Conversations stored on corporate servers.",
        },
        {
            feature: "Crypto & Web3",
            milady: "BSC Native Integrated",
            openclaw: "Web2 Restricted",
            miladySub: "Built-in wallet, DEX trades, PancakeSwap routing.",
            openclawSub: "No native crypto capabilities out-of-the-box.",
        },
        {
            feature: "Autonomy",
            milady: "Automated Trading & DAO",
            openclaw: "Standard Chatbot UI",
            miladySub: "Agentic loops execute trades and govern DAOs autonomously.",
            openclawSub: "Requires constant manual prompting and supervision.",
        },
        {
            feature: "Flexibility",
            milady: "Multi-Model Support",
            openclaw: "Proprietary Lockdown",
            miladySub: "Plug in Claude, GPT, Ollama, DeepSeek—your choice.",
            openclawSub: "Locked into a specific, controlled model ecosystem.",
        },
        {
            feature: "Identity",
            milady: "Custom Personality",
            openclaw: "Generic Assistant",
            miladySub: "Fully modifiable character, voice, and behavior traits.",
            openclawSub: "Forced 'helpful AI' standard alignment.",
        }
    ];

    return (
        <section id="comparison" className="relative py-48 bg-transparent text-text-light overflow-hidden">
            <div className="max-w-5xl mx-auto px-6 md:px-12 relative z-10">

                <div className="mb-32">
                    <p className="text-xs font-mono text-white/50 tracking-[0.2em] uppercase mb-6 flex items-center gap-4">
                        <span className="w-8 h-[1px] bg-white/40"></span>
                        System Specifications
                    </p>
                    <h2 className="text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter uppercase">
                        Milady OS <br />
                        <span className="text-white/40">VS OpenClaw</span>
                    </h2>
                </div>

                <div className="space-y-24">
                    {categories.map((row, index) => (
                        <div key={index} className="flex flex-col md:flex-row md:items-start gap-6 md:gap-16 group border-t border-white/5 pt-12 mt-[-3rem]">

                            <div className="w-full md:w-1/4 pt-2">
                                <h3 className="font-mono text-xs text-brand tracking-[0.2em] uppercase">{row.feature}</h3>
                            </div>

                            <div className="w-full md:w-3/4 flex flex-col sm:flex-row gap-12 sm:gap-24">

                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-2 h-2 bg-brand"></div>
                                        <span className="font-black text-2xl lg:text-3xl uppercase tracking-tighter text-white">{row.milady}</span>
                                    </div>
                                    <p className="font-mono text-sm text-white/90 leading-relaxed pr-8">{row.miladySub}</p>
                                </div>

                                <div className="flex-1 opacity-80 transition-opacity duration-300 group-hover:opacity-100">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-2 h-2 bg-white/60"></div>
                                        <span className="font-medium text-xl lg:text-2xl uppercase tracking-tighter text-white/90 line-through decoration-brand/50">{row.openclaw}</span>
                                    </div>
                                    <p className="font-mono text-sm text-white/70 leading-relaxed pr-8">{row.openclawSub}</p>
                                </div>

                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
