import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { releaseData } from "../generated/release-data";

export const PHRASES = [
  "YOUR INTERFACE",
  "YOUR AGENTS",
  "YOUR RUNTIME",
  "YOUR CONTROL",
  "YOUR DATA",
  "YOUR MACHINE",
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
    <section className="absolute inset-0 flex flex-col items-center justify-start sm:justify-center px-4 sm:px-6 md:px-12 pt-20 sm:pt-8 pb-36 sm:pb-0 pointer-events-none overflow-hidden">
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
          className="text-[15vw] sm:text-[10vw] md:text-[11vw] lg:text-[12vw] xl:text-[10vw] 2xl:text-[9vw] font-black leading-[0.8] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-4 sm:mt-8 max-w-[12ch] sm:max-w-none"
        >
          <span>MILADY</span>
          <span className="text-brand drop-shadow-lg text-[12vw] sm:text-[9vw] md:text-[10vw] lg:text-[11vw] xl:text-[9vw] 2xl:text-[8vw]">
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
      <div className="flex flex-wrap items-center justify-center gap-2 text-[8px] sm:text-[10px] tracking-wider uppercase font-mono text-center">
        <span className="text-brand/70 border border-brand/20 px-2 py-0.5 bg-brand/[0.03]">
          {tagName}
        </span>
        <span className="text-text-muted/30">{publishedAt}</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[8px] sm:text-[10px] tracking-[0.2em] uppercase text-text-muted/40">
        <Link
          to="/dashboard"
          className="hover:text-brand/60 transition-colors duration-200"
        >
          dashboard
        </Link>
        <span className="text-white/10">·</span>
        <a
          href="https://github.com/milady-ai/milady"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand/60 transition-colors duration-200"
        >
          source
        </a>
        <span className="text-white/10">·</span>
        <a
          href="https://docs.milady.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand/60 transition-colors duration-200"
        >
          docs
        </a>
      </div>
    </motion.div>
  );
}
