import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Nav } from "./components/Nav";
import { HeroBackground, HeroForeground } from "./components/Hero";
import { Privacy } from "./components/Privacy";
import { DeFi } from "./components/DeFi";
import { Features } from "./components/Features";
import { Comparison } from "./components/Comparison";
import { Document } from "./components/Document";
import { DocumentationPage } from "./components/DocumentationPage";
import { Footer } from "./components/Footer";
import { VrmAvatar } from "./components/VrmAvatar";

export function App() {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  if (pathname.startsWith("/document")) {
    return <DocumentationPage />;
  }

  return (
    <div className="relative min-h-screen bg-dark text-text-light font-sans selection:bg-brand selection:text-dark">
      {/* 1. Base Dark Background */}
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none"></div>

      {/* Main scrolling container without a global stacking context (no z-index here) */}
      <div className="relative w-full">

        {/* LAYER 1: Background Layout (The massive typography, moves with scroll) */}
        <div className="relative z-10 w-full min-h-screen pointer-events-none">
          <HeroBackground />
        </div>

        {/* LAYER 2: The 3D Canvas (Midground - In FRONT of text, behind buttons/content) */}
        {/* Fixed position, doesn't scroll, but its z-index (20) puts it exactly between layer 1 and 3 */}
        <div className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center">
          <Canvas camera={{ position: [0, 0.5, 3.5], fov: 40 }} className="absolute inset-0 w-full h-full">
            <ambientLight intensity={0.1} />
            <directionalLight position={[0, 10, 5]} intensity={4} color="#ffffff" castShadow />
            <directionalLight position={[-5, 5, -5]} intensity={2.5} color="#f0b90b" />
            <directionalLight position={[5, 5, -5]} intensity={1.5} color="#0b35f1" />

            <Suspense fallback={null}>
              <group position={[0, -1.0, 0]}>
                <VrmAvatar url="/vrms/shaw.vrm" />
              </group>
            </Suspense>
          </Canvas>

          {/* HUD Scanline Overlay over the 3D model */}
          <div className="absolute inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] mix-blend-overlay opacity-30 pointer-events-none"></div>
        </div>

        {/* LAYER 3: Foreground UI (Nav, Buttons, Content Sections) */}
        {/* Overlaps perfectly on top of Layer 1 due to absolute positioning */}
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="pointer-events-auto">
            <Nav />
          </div>
          <div className="w-full min-h-screen">
            <HeroForeground />
          </div>
        </div>

        {/* Content sections below Hero -> Flows normally after Layer 1 (z-30 ensures it covers Canvas) */}
        <main className="relative z-30 pointer-events-auto bg-dark">
          <Comparison />
          <DeFi />
          <Privacy />
          <Features />
          <Document />
        </main>

        <footer className="relative z-30 pointer-events-auto bg-dark">
          <Footer />
        </footer>
      </div>
    </div>
  );
}
