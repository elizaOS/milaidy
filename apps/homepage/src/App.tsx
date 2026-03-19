import { Comparison } from "./components/Comparison";
import { DownloadIcons } from "./components/DownloadIcons";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { HeroBackground } from "./components/Hero";
import { Privacy } from "./components/Privacy";

export function Homepage() {
  return (
    <div
      id="top"
      className="relative min-h-screen bg-dark text-text-light font-sans selection:bg-brand selection:text-dark"
    >
      {/* 1. Base Dark Background */}
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none" />

      {/* Main scrolling container */}
      <div className="relative w-full">
        {/* LAYER 1: Hero with CTA */}
        <div className="relative z-10 w-full min-h-screen">
          <HeroBackground />
        </div>

        {/* Content sections below Hero */}
        <main className="relative z-30 pointer-events-auto bg-dark">
          {/* Download section */}
          <section id="install" className="py-16 sm:py-24 flex flex-col items-center px-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-light mb-3 text-center">
              Get the App
            </h2>
            <p className="text-text-muted text-sm mb-8 text-center max-w-md">
              Run Milady locally on any platform. Your agents stay on your machine.
            </p>
            <DownloadIcons />
          </section>

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
