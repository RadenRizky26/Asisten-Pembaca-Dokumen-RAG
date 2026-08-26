"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";

interface WordPullUpProps {
  words: string;
  className?: string;
  delay?: number;
  children?: React.ReactNode;
}

export function WordPullUp({
  words,
  className,
  delay = 0,
  children,
}: WordPullUpProps) {
  const prefersReducedMotion = useReducedMotion();
  const wordArray = useMemo(() => words.split(" "), [words]);

  const container: Variants = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: delay * i },
    }),
  };

  const child: Variants = {
    hidden: {
      opacity: 0,
      y: 0.6,
      filter: "blur(6px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.45, type: "spring", bounce: 0.1 },
    },
  };

  if (prefersReducedMotion) {
    return (
      <div className={className}>
        <span>{words}</span>
        {children}
      </div>
    );
  }

  return (
    <motion.h2
      variants={container}
      initial="hidden"
      animate="visible"
      className={twMerge("flex flex-wrap justify-center gap-x-1.5", className)}
    >
      {wordArray.map((word, i) => (
        <motion.span key={`${word}-${i}`} variants={child}>
          {word}
        </motion.span>
      ))}
      {children}
    </motion.h2>
  );
}
