import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export const PHRASES = [
  "LOCAL FIRST",
  "AUTONOMOUS BADASS",
  "SHE IS IN CHARGE",
  "TAKES THE LEAD",
  "HEAD BITCH IN CHARGE",
  "KNEEL BEFORE HER",
  "GETS SHIT DONE",
  "WAIFU WONDERWOMAN",
];

const TYPE_SPEED = 70;
const DELETE_SPEED = 40;
const PAUSE_AFTER_TYPE = 1800;
const PAUSE_AFTER_DELETE = 400;

function TypewriterLoop() {
  const [display, setDisplay] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const phrase = PHRASES[phraseIndex];

    if (!isDeleting) {
      if (display.length < phrase.length) {
        const timeout = setTimeout(() => {
          setDisplay(phrase.slice(0, display.length + 1));
        }, TYPE_SPEED);
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setIsDeleting(true), PAUSE_AFTER_TYPE);
      return () => clearTimeout(timeout);
    }

    if (display.length > 0) {
      const timeout = setTimeout(() => {
        setDisplay(display.slice(0, -1));
      }, DELETE_SPEED);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setIsDeleting(false);
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, PAUSE_AFTER_DELETE);
    return () => clearTimeout(timeout);
  }, [display, isDeleting, phraseIndex]);

  return (
    <>
      {display}
      <span className="inline-block w-[0.06em] h-[0.8em] bg-brand ml-[0.04em] align-middle animate-pulse" />
    </>
  );
}

export function HeroBackground() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.15,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

  return (
    <section className="absolute inset-0 flex flex-col items-center justify-center px-6 md:px-12 overflow-hidden">
      {/* HUD Frame Elements */}
      <div className="absolute top-12 left-12 w-6 h-6 border-t-2 border-l-2 border-white/20" />
      <div className="absolute top-12 right-12 w-6 h-6 border-t-2 border-r-2 border-white/20" />
      <div className="absolute bottom-12 left-12 w-6 h-6 border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-12 right-12 w-6 h-6 border-b-2 border-r-2 border-white/20" />

      {/* Grid Lines */}
      <div className="absolute top-0 bottom-0 left-[20%] w-[1px] bg-white/[0.03]" />
      <div className="absolute top-0 bottom-0 right-[20%] w-[1px] bg-white/[0.03]" />
      <div className="absolute top-[30%] left-0 right-0 h-[1px] bg-white/[0.03]" />

      {/* Central Content */}
      <motion.div
        className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* PRIMARY: Original Massive MILADY Title + Typewriter */}
        <motion.h1
          variants={itemVariants}
          className="text-[10vw] sm:text-[11vw] lg:text-[13vw] font-black leading-[0.8] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-12"
        >
          <span>MILADY</span>
          <span className="text-brand drop-shadow-lg">
            <TypewriterLoop />
          </span>
        </motion.h1>

        {/* SECONDARY: Value prop + Dashboard CTA */}
        <motion.p
          variants={itemVariants}
          className="max-w-xl text-sm sm:text-base text-text-muted leading-relaxed px-4 mt-8"
        >
          Deploy autonomous AI agents in one click.{" "}
          <span className="text-text-light font-medium">
            Your agents. Your data. Your cloud.
          </span>
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-5"
        >
          <Link
            to="/dashboard"
            className="px-7 py-3 bg-brand text-dark font-bold text-sm rounded-xl
              hover:bg-brand-hover active:scale-[0.97] transition-all duration-150
              shadow-[0_0_30px_rgba(240,185,11,0.25)] hover:shadow-[0_0_40px_rgba(240,185,11,0.35)]"
          >
            Launch Dashboard →
          </Link>
          <a
            href="#install"
            className="px-5 py-2.5 text-text-muted text-sm font-medium rounded-xl border border-border
              hover:text-text-light hover:border-text-muted hover:bg-surface transition-all duration-150"
          >
            Download Desktop App
          </a>
        </motion.div>

        {/* Trust line */}
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-4 text-xs text-text-muted/60 mt-4"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Free to start
          </span>
          <span className="w-px h-3 bg-border" />
          <span>No credit card required</span>
          <span className="w-px h-3 bg-border" />
          <span>Open source</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
