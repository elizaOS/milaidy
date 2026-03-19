const features = [
  {
    title: "Runs Locally",
    description:
      "Your AI runs on your machine. Your data never leaves your device. No cloud dependency.",
    icon: (
      <svg
        className="w-12 h-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <title>Runs locally</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
        />
      </svg>
    ),
    image: "/color-asset-1.png",
    imageStyle: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      width: "160px",
      height: "210px",
      objectFit: "contain" as const,
      objectPosition: "bottom left",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease",
    },
  },
  {
    title: "Offline Capable",
    description:
      "Run local models with Ollama. Fully functional without an internet connection.",
    icon: (
      <svg
        className="w-12 h-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <title>Offline capable</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    image: "/color-asset-2.png",
    imageStyle: {
      position: "absolute" as const,
      top: 0,
      left: "50%",
      width: "160px",
      height: "210px",
      objectFit: "contain" as const,
      objectPosition: "bottom center",
      transform: "translateX(-50%) rotate(180deg)",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease 0.08s",
    },
  },
  {
    title: "Zero Telemetry",
    description:
      "No tracking. No analytics. No backdoors. Your conversations are yours alone.",
    icon: (
      <svg
        className="w-12 h-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <title>Zero telemetry</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
    image: "/color-asset-3.png",
    imageStyle: {
      position: "absolute" as const,
      right: 0,
      top: "50%",
      width: "160px",
      height: "210px",
      objectFit: "contain" as const,
      objectPosition: "bottom center",
      transform: "translateY(-50%) rotate(-90deg)",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease 0.16s",
    },
  },
];

export function Privacy() {
  return (
    <section
      id="privacy"
      className="relative py-48 bg-dark text-text-light min-h-screen flex items-center"
    >
      <div className="max-w-7xl mx-auto w-full px-6 md:px-12 relative z-10">
        <div className="mb-32">
          <p className="font-mono text-brand text-xs uppercase tracking-[0.2em] mb-4">
            Secure Environment
          </p>
          <h2 className="text-6xl md:text-8xl lg:text-[9rem] font-black leading-[0.85] tracking-tighter max-w-5xl uppercase">
            Absolute
            <br />
            Silence.
          </h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex-1 p-12 lg:p-16 bg-white/[0.02] hover:bg-white hover:text-dark transition-colors duration-500 group min-h-[400px] flex flex-col justify-end relative rounded-sm overflow-hidden"
            >
              <img
                src={feature.image}
                alt=""
                className="opacity-0 group-hover:opacity-100"
                style={feature.imageStyle}
                draggable={false}
              />
              <div className="relative z-10">
                <div className="text-white group-hover:text-dark mb-16 transition-colors duration-500 opacity-50 group-hover:opacity-100">
                  {feature.icon}
                </div>
                <h3 className="text-3xl lg:text-4xl font-black mb-6 uppercase tracking-tighter leading-none">
                  {feature.title}
                </h3>
                <p className="font-mono text-sm leading-relaxed text-white/40 group-hover:text-dark/70 transition-colors duration-500">
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
