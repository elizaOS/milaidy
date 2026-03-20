import { Comparison } from "./components/Comparison";
import { DownloadIcons } from "./components/DownloadIcons";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { HeroBackground, HeroInstallDock } from "./components/Hero";
import { Privacy } from "./components/Privacy";

export function Homepage() {
  return (
    <div
      id="top"
      className="relative min-h-screen bg-dark text-text-light font-sans selection:bg-brand selection:text-dark"
    >
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none" />

      <div className="relative w-full">
        <section
          id="install"
          className="relative z-10 min-h-[100svh] overflow-hidden"
        >
          <HeroBackground />

          <div className="relative z-30 flex min-h-[100svh] flex-col items-center px-4 pt-[max(5rem,12svh)] pb-8 sm:px-6 sm:pt-0 sm:pb-10 lg:pb-12 pointer-events-auto">
            <div className="w-full min-h-[clamp(14rem,42svh,22rem)] sm:min-h-[62svh]" />

            <div className="mt-auto flex w-full flex-col items-center gap-4 sm:gap-6">
              <DownloadIcons />
              <HeroInstallDock />
            </div>
          </div>
        </section>

        <main className="relative z-30 pointer-events-auto bg-dark">
          <Privacy />
          <Features />
          <Comparison />
        </main>

        <footer className="relative z-30 pointer-events-auto bg-dark">
          <Footer />
        </footer>
      </div>
    </div>
  );
}
