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
    <section className="absolute inset-0 flex flex-col items-center justify-start sm:justify-center px-4 sm:px-6 md:px-12 pt-24 sm:pt-12 pb-44 sm:pb-0 pointer-events-none overflow-hidden">
      <div className="hidden sm:block absolute top-12 left-12 w-6 h-6 border-t-2 border-l-2 border-white/20" />
      <div className="hidden sm:block absolute top-12 right-12 w-6 h-6 border-t-2 border-r-2 border-white/20" />
      <div className="hidden sm:block absolute bottom-12 left-12 w-6 h-6 border-b-2 border-l-2 border-white/20" />
      <div className="hidden sm:block absolute bottom-12 right-12 w-6 h-6 border-b-2 border-r-2 border-white/20" />

      <div className="hidden md:block absolute top-0 bottom-0 left-[20%] w-[1px] bg-white/[0.03]" />
      <div className="hidden md:block absolute top-0 bottom-0 right-[20%] w-[1px] bg-white/[0.03]" />
      <div className="hidden md:block absolute top-[30%] left-0 right-0 h-[1px] bg-white/[0.03]" />

      <motion.div
        className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          variants={itemVariants}
          className="text-[16vw] sm:text-[11vw] lg:text-[13vw] font-black leading-[0.76] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-4 sm:mt-12 max-w-[10ch] sm:max-w-none"
        >
          <span>MILADY</span>
          <span className="text-brand drop-shadow-lg text-[13vw] sm:text-inherit">
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
      className="flex flex-col items-center gap-3 sm:gap-5 px-4"
      variants={dockVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="flex flex-wrap items-center justify-center gap-2 text-[9px] sm:text-[11px] tracking-wider uppercase font-mono text-center">
        <span className="text-brand/80 border border-brand/25 px-2 py-0.5 bg-brand/5">
          {tagName}
        </span>
        <span className="text-text-muted/40">{publishedAt}</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[9px] sm:text-[11px] tracking-[0.24em] uppercase text-text-muted/50">
        <Link
          to="/dashboard"
          className="hover:text-brand/70 transition-colors duration-200"
        >
          dashboard
        </Link>
        <span className="text-white/10 hidden sm:inline">·</span>
        <a
          href="https://github.com/milady-ai/milady"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand/70 transition-colors duration-200"
        >
          src
        </a>
      </div>
    </motion.div>
  );
}
