export function AvatarLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10 transition-opacity duration-500">
      <div className="relative flex flex-col items-center">
        {/* Outer glowing ring */}
        <div className="absolute w-32 h-32 rounded-full border-2 border-white/20 animate-[spin_3s_linear_infinite]" />

        {/* Inner fast ring */}
        <div className="absolute w-24 h-24 rounded-full border-t-2 border-b-2 border-primary/80 animate-[spin_1.5s_ease-in-out_infinite]" />

        {/* Core pulse */}
        <div className="w-16 h-16 rounded-full bg-primary/20 backdrop-blur-md border border-primary/50 flex items-center justify-center animate-pulse">
          <div className="w-8 h-8 rounded-full bg-primary/80 shadow-[0_0_15px_rgba(var(--primary),0.8)]" />
        </div>

        <div className="mt-8 text-primary/90 font-mono text-sm tracking-[0.2em] uppercase animate-pulse">
          Initializing Entity...
        </div>

        {/* Decorative scanning lines */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
          <div className="w-full h-1 bg-primary/40 absolute top-[-50%] animate-[scan_2s_linear_infinite] shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
        </div>
      </div>
      {/* 
      <style jsx>{`
        @keyframes scan {
          0% { top: -10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 110%; opacity: 0; }
        }
      `}</style> */}
    </div>
  );
}
