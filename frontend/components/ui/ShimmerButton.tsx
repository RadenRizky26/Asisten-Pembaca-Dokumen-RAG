"use client";

import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface ShimmerButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
}

export function ShimmerButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className,
  variant = "primary",
  fullWidth = false,
}: ShimmerButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={twMerge(
        "relative overflow-hidden rounded-lg px-5 py-2.5 text-button font-medium transition-colors",
        fullWidth && "w-full",
        variant === "primary" &&
          "bg-primary text-on-primary hover:brightness-110 disabled:opacity-50",
        variant === "ghost" &&
          "bg-transparent text-ink hover:bg-surface-strong disabled:opacity-50",
        disabled && "cursor-not-allowed",
        className,
      )}
    >
      {variant === "primary" && !disabled && (
        <motion.span
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          initial={{ x: "-150%", skewX: "-15deg" }}
          animate={{ x: "250%", skewX: "-15deg" }}
          transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.5 }}
          style={{ width: "40%" }}
        />
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </motion.button>
  );
}
