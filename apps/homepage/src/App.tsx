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
      {/* 1. Base Dark Background */}
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none" />

      {/* Main scrolling container */}
      <div className="relative w-full">
        {/* LAYER 1: Background Layout (The massive typography, moves with scroll) */}
        <div className="relative z-10 w-full min-h-screen pointer-events-none">
          <HeroBackground />
        </div>

        {/* LAYER 2: Foreground UI — Download dock pinned to hero bottom */}
        <div
          id="install"
          className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
        >
          <div className="w-full min-h-[100svh] flex flex-col items-center justify-end pb-6 sm:pb-10 lg:pb-12 px-4 sm:px-6 gap-4 sm:gap-6 pointer-events-auto">
            <DownloadIcons />
            <HeroInstallDock />
          </div>
        </div>

        {/* Content sections below Hero */}
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
