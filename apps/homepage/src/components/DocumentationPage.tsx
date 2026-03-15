import { allTopics, currentSlugFromPath, developerTopics, topicBySlug, topicHref, userTopics } from "./docs/pages";

export function DocumentationPage() {
  const slug = currentSlugFromPath();
  const current = topicBySlug.get(slug) ?? topicBySlug.get("user-guide");
  if (!current) {
    return null;
  }
  const currentIndex = allTopics.findIndex((topic) => topic.slug === current.slug);
  const prev = currentIndex > 0 ? allTopics[currentIndex - 1] : null;
  const next = currentIndex < allTopics.length - 1 ? allTopics[currentIndex + 1] : null;

  return (
    <div className="h-screen flex flex-col bg-dark text-text-light font-sans overflow-hidden">
      <header className="flex-none flex items-center justify-between px-6 py-4 md:px-12 bg-dark/95 backdrop-blur-md border-b border-sharp z-50">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full bg-brand" />
          <span className="font-black tracking-tighter text-2xl uppercase">Milady Documentation</span>
        </div>
        <a href="/" className="border-sharp px-4 py-2 text-xs font-mono uppercase tracking-widest hover:bg-brand hover:text-dark transition-colors duration-300">
          Back Home
        </a>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <aside className="lg:w-[280px] lg:h-full lg:overflow-y-auto py-12 px-6 lg:pr-6 lg:pl-12 shrink-0 custom-scrollbar border-r border-sharp/10">
          <div className="h-fit">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-brand mb-4">User</p>
          <div className="space-y-2 mb-8">
            {userTopics.map((topic) => (
              <a
                key={topic.slug}
                href={topicHref(topic.slug)}
                className={`block border px-3 py-2 text-sm transition-colors duration-200 ${
                  current.slug === topic.slug ? "border-sharp text-text-light bg-white/[0.04]" : "border-transparent text-text-muted hover:text-text-light hover:border-sharp"
                }`}
              >
                {topic.title}
              </a>
            ))}
          </div>

          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-brand mb-4">Developer</p>
          <div className="space-y-2">
            {developerTopics.map((topic) => (
              <a
                key={topic.slug}
                href={topicHref(topic.slug)}
                className={`block border px-3 py-2 text-sm transition-colors duration-200 ${
                  current.slug === topic.slug ? "border-sharp text-text-light bg-white/[0.04]" : "border-transparent text-text-muted hover:text-text-light hover:border-sharp"
                }`}
              >
                {topic.title}
              </a>
            ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 lg:h-full lg:overflow-y-auto py-12 px-6 md:px-12 lg:pl-16">
          <div className="max-w-4xl">
            <section className="mb-12">
              <p className="font-mono text-brand text-xs uppercase tracking-[0.2em] mb-4">{current.group} Documentation</p>
              <h1 className="text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter uppercase mb-6">{current.title}</h1>
              <p className="text-base md:text-xl leading-relaxed text-white/70">{current.summary}</p>
            </section>
            
            <div className="prose-invert">
              <current.Page />
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-24 mb-12">
              {prev && (
                <a 
                  href={topicHref(prev.slug)} 
                  className={`border border-sharp bg-white/[0.02] p-8 hover:bg-white hover:text-dark transition-all duration-300 group ${!next ? "md:col-span-2" : ""}`}
                >
                  <p className="text-xs font-mono uppercase tracking-widest text-brand mb-3 group-hover:text-dark/60 transition-colors">Previous</p>
                  <p className="font-black tracking-tight text-2xl uppercase italic">{prev.title}</p>
                </a>
              )}
              {next && (
                <a 
                  href={topicHref(next.slug)} 
                  className={`border border-sharp bg-white/[0.02] p-8 hover:bg-white hover:text-dark transition-all duration-300 group md:text-right ${!prev ? "md:col-span-2" : ""}`}
                >
                  <p className="text-xs font-mono uppercase tracking-widest text-brand mb-3 group-hover:text-dark/60 transition-colors">Next</p>
                  <p className="font-black tracking-tight text-2xl uppercase italic">{next.title}</p>
                </a>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
