"use client";

import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface ShinyButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "ghost";
}

export default function ShinyButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className,
  variant = "primary",
}: ShinyButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={twMerge(
        "relative overflow-hidden rounded-lg px-5 py-2.5 text-button font-medium transition-colors",
        variant === "primary" &&
          "bg-primary text-on-primary hover:brightness-110 disabled:opacity-50",
        variant === "ghost" &&
          "bg-transparent text-ink hover:bg-surface-strong disabled:opacity-50",
        disabled && "cursor-not-allowed",
        className,
      )}
    >
      {variant === "primary" && (
        <motion.span
          className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: "-100%", skewX: "-15deg" }}
          whileHover={{ x: "200%", skewX: "-15deg" }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
