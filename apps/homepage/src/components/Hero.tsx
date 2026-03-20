import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { releaseData } from "../generated/release-data";

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
      <span className="inline-block w-[0.06em] h-[0.8em] bg-brand ml-[0.04em] align-middle cursor-blink" />
    </>
  );
}

export function HeroBackground() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

  return (
    <section className="absolute inset-x-0 top-0 bottom-[45%] sm:bottom-0 flex flex-col items-center justify-start sm:justify-center px-4 sm:px-6 md:px-12 pt-24 sm:pt-12 pointer-events-none overflow-hidden">
      {/* Corner accents — sharp, terminal-like */}
      <div className="hidden sm:block absolute top-12 left-12 w-6 h-6 border-t border-l border-brand/30" />
      <div className="hidden sm:block absolute top-12 right-12 w-6 h-6 border-t border-r border-brand/30" />
      <div className="hidden sm:block absolute bottom-12 left-12 w-6 h-6 border-b border-l border-brand/30" />
      <div className="hidden sm:block absolute bottom-12 right-12 w-6 h-6 border-b border-r border-brand/30" />

      {/* Grid lines */}
      <div className="hidden md:block absolute top-0 bottom-0 left-[20%] w-px bg-border-subtle" />
      <div className="hidden md:block absolute top-0 bottom-0 right-[20%] w-px bg-border-subtle" />
      <div className="hidden md:block absolute top-[30%] left-0 right-0 h-px bg-border-subtle" />

      <motion.div
        className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          variants={itemVariants}
          className="text-[28vw] sm:text-[clamp(4rem,9vw,8rem)] lg:text-[clamp(5rem,10vw,10rem)] font-black leading-[0.82] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-16 sm:mt-12 max-w-[10ch] sm:max-w-none"
        >
          <span>MILADY</span>
          <span className="text-white/90 drop-shadow-lg text-[28vw] sm:text-[clamp(3rem,7vw,6.5rem)] lg:text-[clamp(4rem,8vw,8rem)] break-words hyphens-none text-center w-full">
            <TypewriterLoop />
          </span>
        </motion.h1>
      </motion.div>
    </section>
  );
}

export function HeroInstallDock() {
  const tagName = releaseData.release.tagName;
  const publishedAt = releaseData.release.publishedAtLabel;

  const dockVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 80,
        damping: 18,
        delay: 0.6,
      },
    },
  };

  return (
    <motion.div
      className="flex flex-col items-center gap-4 sm:gap-5 px-4"
      variants={dockVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Version badge — terminal style */}
      <div className="flex items-center gap-3 font-mono text-[10px] sm:text-[11px] tracking-wider">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand/5 border border-brand/20">
          <span className="w-1.5 h-1.5 rounded-full bg-brand status-pulse" />
          <span className="text-brand">{tagName}</span>
        </div>
        <span className="text-text-subtle">{publishedAt}</span>
      </div>

      {/* Quick links — monospace, minimal */}
      <div className="flex items-center gap-4 font-mono text-[10px] sm:text-[11px] tracking-wider uppercase text-text-subtle">
        <Link
          to="/dashboard"
          className="hover:text-brand transition-colors duration-200"
        >
          dashboard
        </Link>
        <span className="w-px h-3 bg-border hidden sm:block" />
        <a
          href="https://github.com/milady-ai/milady"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-brand transition-colors duration-200"
        >
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          source
        </a>
      </div>
    </motion.div>
  );
}
