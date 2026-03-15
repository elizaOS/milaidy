import { useEffect, useRef } from "react";

const capabilities = [
  {
    title: "BSC Native Wallet",
    description: "Built-in wallet with BNB and BEP-20 token support. Your keys, your crypto.",
    image: "/black-asset-1.png",
    imageStyle: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      width: "150px",
      height: "200px",
      objectFit: "contain" as const,
      objectPosition: "bottom left",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease",
    },
  },
  {
    title: "DEX Trading",
    description: "Swap tokens directly through your AI companion. Real-time pricing from PancakeSwap.",
    image: "/black-asset-2.png",
    imageStyle: {
      position: "absolute" as const,
      top: 0,
      left: "50%",
      width: "150px",
      height: "200px",
      objectFit: "contain" as const,
      objectPosition: "bottom center",
      transform: "translateX(-50%) rotate(180deg)",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease 0.08s",
    },
  },
  {
    title: "Portfolio Tracking",
    description: "Auto-discover token balances, track trade history, and monitor positions — all locally.",
    image: "/black-asset-3.png",
    imageStyle: {
      position: "absolute" as const,
      right: 0,
      top: "50%",
      width: "150px",
      height: "200px",
      objectFit: "contain" as const,
      objectPosition: "bottom center",
      transform: "translateY(-50%) rotate(-90deg)",
      zIndex: 0,
      pointerEvents: "none" as const,
      transition: "opacity 0.5s ease 0.16s",
    },
  },
];

function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];

    const charSet = ["M", "I", "L", "A", "D", "Y", " ", "A", "I"];
    const fontSize = 18;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.offsetWidth;
      height = parent.offsetHeight;
      canvas.width = width;
      canvas.height = height;

      columns = Math.floor(width / fontSize);
      drops = [];
      for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100;
      }
    };

    resize();
    window.addEventListener("resize", resize);

    let frame: number;
    let lastTime = 0;
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      if (time - lastTime < 50) return; // ~20fps for matrix feeling
      lastTime = time;

      // Light background with opacity to create trail
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#000000"; // dark text
      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const char = charSet[Math.floor(Math.random() * charSet.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        if (Math.random() > 0.9) {
          ctx.fillStyle = "#888888"; // occasional grey font
        } else {
          ctx.fillStyle = "#000000"; // mostly black font
        }

        ctx.fillText(char, x, y);

        if (y > height && Math.random() > 0.95) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };
    render(0);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-90" />;
}

function ScratchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Create custom brush stroke with irregular doodle lines
    const svgStr = `<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg"><path d="M 40 80 Q 90 20 160 70 Q 200 120 140 180 Q 80 210 40 160 Q 0 100 40 80" fill="black" opacity="0.9"/><path d="M 20 100 Q 60 50 120 90 Q 180 140 120 200 Q 60 220 20 160 Q -20 120 20 100" fill="black" opacity="0.5"/></svg>`;
    const brushImg = new Image();
    brushImg.src = 'data:image/svg+xml;base64,' + btoa(svgStr);

    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.offsetWidth;
      height = parent.offsetHeight;

      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    let mouse = { x: -1000, y: -1000, isMoving: false };
    let lastMouse = { x: -1000, y: -1000 };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      if (mouse.x === -1000) {
        lastMouse.x = currentX;
        lastMouse.y = currentY;
      } else {
        lastMouse.x = mouse.x;
        lastMouse.y = mouse.y;
      }

      mouse.x = currentX;
      mouse.y = currentY;
      mouse.isMoving = true;
    };

    const onMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      mouse.isMoving = false;
    };

    const parent = canvas.parentElement;
    parent?.addEventListener("mousemove", onMouseMove);
    parent?.addEventListener("mouseleave", onMouseLeave);

    let frame: number;
    const render = () => {
      ctx.globalCompositeOperation = "source-over";
      // Faster healing rate (0.1) so background recovers quickly
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(0, 0, width, height);

      if (mouse.isMoving && brushImg.complete) {
        ctx.globalCompositeOperation = "destination-out";

        const dx = mouse.x - lastMouse.x;
        const dy = mouse.y - lastMouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(dist / 20));

        for (let i = 1; i <= steps; i++) {
          const x = lastMouse.x + (dx * i / steps);
          const y = lastMouse.y + (dy * i / steps);
          ctx.drawImage(brushImg, x - 120, y - 120, 240, 240);
        }

        mouse.isMoving = false;
      }

      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      parent?.removeEventListener("mousemove", onMouseMove);
      parent?.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none w-full h-full"
    />
  );
}

export function DeFi() {
  return (
    <section id="defi" className="relative py-48 bg-white text-dark overflow-hidden">

      {/* Deep Background: Matrix Pattern */}
      <MatrixBackground />

      {/* Midground: Healing Scratch Layer */}
      <ScratchCanvas />

      {/* Foreground Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 pointer-events-none">

        {/* Left Column - Sticky Title */}
        <div className="lg:col-span-5 flex flex-col justify-start pointer-events-auto">
          <div className="lg:sticky lg:top-48">
            <p className="font-mono text-brand text-xs uppercase tracking-[0.2em] mb-4">
              [ DEFI.MODULE ]
            </p>
            <h2 className="text-6xl md:text-8xl lg:text-[7rem] font-black leading-[0.85] tracking-tighter uppercase mb-8">
              Crypto <br />
              Built In.
            </h2>
            <p className="font-mono text-dark/50 text-sm tracking-widest max-w-sm leading-relaxed">
              Zero friction Web3 access directly from the native interface.
            </p>
          </div>
        </div>

        {/* Right Column - Scrolling Features */}
        <div className="lg:col-span-7 flex flex-col gap-6 lg:pt-12 pointer-events-auto">
          {capabilities.map((cap, i) => (
            <div
              key={cap.title}
              className="group relative p-8 md:p-12 bg-black/[0.03] hover:bg-dark hover:text-white transition-all duration-500 hover:shadow-2xl backdrop-blur-sm overflow-hidden"
            >
              {/* Animated Accent Line */}
              <div className="absolute top-0 left-0 w-1.5 h-0 bg-brand group-hover:h-full transition-all duration-500 ease-out"></div>

              {/* Character — invisible until hover */}
              <img
                src={cap.image}
                alt=""
                className="opacity-0 group-hover:opacity-100"
                style={cap.imageStyle}
                draggable={false}
              />

              <div className="relative z-10">
                <span className="font-mono text-xs md:text-sm text-brand font-bold tracking-[0.3em] block mb-6">
                  // 0{i + 1}
                </span>
                <h3 className="text-3xl md:text-5xl font-black mb-6 uppercase tracking-tighter text-dark group-hover:text-white transition-colors duration-500">
                  {cap.title}
                </h3>
                <p className="font-mono text-base md:text-lg leading-relaxed text-dark/60 group-hover:text-white/80 transition-colors duration-500">
                  {cap.description}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
