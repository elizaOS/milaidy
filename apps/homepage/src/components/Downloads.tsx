import { useCallback, useEffect, useRef } from "react";
import { releaseData } from "../generated/release-data";

// Platform icons are now handled by DownloadIcons via Font Awesome
function AppleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
function LinuxIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489.037.192.11.398.17.607.062.208.137.424.168.631.032.208.02.406-.069.56-.045.077-.119.136-.232.17-.113.034-.264.044-.47.015z" />
    </svg>
  );
}
function WindowsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 12V5.3l9.5-1.3V12h-9.5zm0 .5H21v7.8l-9.5-1.3v-6.5z" />
    </svg>
  );
}

const shellCommand = releaseData.scripts.shell.command;
const powershellCommand = releaseData.scripts.powershell.command;

function PlatformIcon({ id }: { id: string }) {
  if (id.includes("macos")) return <AppleIcon />;
  if (id.includes("windows")) return <WindowsIcon />;
  return <LinuxIcon />;
}

function platformShortLabel(id: string): string {
  if (id.includes("arm64")) return "Mac M1+";
  if (id.includes("x64") && id.includes("macos")) return "Mac Intel";
  if (id.includes("windows")) return "Windows";
  return "Linux";
}

/* ── Code Rain Canvas ──────────────────────────────────────────────── */

const CHARS = "MILADY".split("");
const FONT_SIZE = 14;
const RAIN_COLOR = "rgba(0,0,0,0.08)";
const RAIN_HEAD_COLOR = "rgba(0,0,0,0.25)";

function CodeRainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const cols = Math.floor(canvas.offsetWidth / FONT_SIZE);
      columnsRef.current = Array.from({ length: cols }, () =>
        Math.floor((Math.random() * canvas.offsetHeight) / FONT_SIZE),
      );
    };

    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const draw = (time: number) => {
      if (time - lastTime < 50) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastTime = time;

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // Fade existing content
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${FONT_SIZE}px monospace`;

      const columns = columnsRef.current;
      for (let i = 0; i < columns.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * FONT_SIZE;
        const y = columns[i] * FONT_SIZE;

        // Head character is darker
        ctx.fillStyle = RAIN_HEAD_COLOR;
        ctx.fillText(char, x, y);

        // Trail characters lighter
        if (columns[i] > 1) {
          ctx.fillStyle = RAIN_COLOR;
          const trailChar = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx.fillText(trailChar, x, y - FONT_SIZE);
        }

        // Reset or advance
        if (y > h && Math.random() > 0.975) {
          columns[i] = 0;
        }
        columns[i]++;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    // Fill initial white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: "block" }}
    />
  );
}

/* ── Reveal Mask (follows cursor) ──────────────────────────────────── */

function RevealMask() {
  const maskRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const el = maskRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--reveal-opacity", "1");
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = maskRef.current;
    if (!el) return;
    el.style.setProperty("--reveal-opacity", "0");
  }, []);

  useEffect(() => {
    const el = maskRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    parent.addEventListener("mousemove", handleMouseMove);
    parent.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      parent.removeEventListener("mousemove", handleMouseMove);
      parent.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return (
    <div
      ref={maskRef}
      className="reveal-mask"
      style={
        {
          "--mx": "50%",
          "--my": "50%",
          "--reveal-opacity": "0",
        } as React.CSSProperties
      }
    />
  );
}

/* ── Downloads Section ─────────────────────────────────────────────── */

export function Downloads() {
  return (
    <section id="install" className="relative overflow-hidden py-32 text-dark">
      {/* Code rain background */}
      <CodeRainBackground />

      {/* White overlay with cursor reveal hole */}
      <RevealMask />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl px-6 md:px-12">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-brand">
            Install
          </p>
          <h2 className="text-3xl font-black uppercase tracking-tighter md:text-5xl">
            Get Milady
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-dark/60">
            Download the desktop app or bootstrap via terminal. All artifacts
            pulled from GitHub Releases.
          </p>
        </div>

        {/* Download buttons — compact row */}
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          {releaseData.release.downloads.map((download) => (
            <a
              key={download.id}
              href={download.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2.5 border border-dark/10 bg-white px-5 py-3 font-mono text-sm transition-all duration-200 hover:border-dark hover:bg-black hover:text-white"
            >
              <PlatformIcon id={download.id} />
              <span className="font-bold uppercase tracking-wide">
                {platformShortLabel(download.id)}
              </span>
              <span className="text-[10px] text-dark/40 group-hover:text-white/40">
                {download.sizeLabel}
              </span>
            </a>
          ))}
        </div>

        {/* Install commands */}
        <div className="grid gap-4 md:grid-cols-2 mb-12">
          <div className="bg-black rounded-lg p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/70 font-bold">
                macOS / Linux / WSL
              </span>
            </div>
            <pre className="overflow-x-auto text-xs text-green-400 leading-relaxed">
              <code>{shellCommand}</code>
            </pre>
          </div>

          <div className="bg-black rounded-lg p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/70 font-bold">
                Windows PowerShell
              </span>
            </div>
            <pre className="overflow-x-auto text-xs text-blue-400 leading-relaxed">
              <code>{powershellCommand}</code>
            </pre>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-dark/40">
          <span>
            {releaseData.release.prerelease ? "Canary" : "Stable"} •{" "}
            {releaseData.release.tagName}
          </span>
          <span>•</span>
          <span>Published {releaseData.release.publishedAtLabel}</span>
          <span>•</span>
          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            All release assets →
          </a>
        </div>
      </div>
    </section>
  );
}
