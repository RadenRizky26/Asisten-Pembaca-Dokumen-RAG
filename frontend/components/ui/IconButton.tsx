"use client";

import { type Icon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

interface IconButtonProps {
  icon: Icon;
  label: string;
  onClick?: () => void;
  size?: number;
  weight?: "regular" | "thin" | "light" | "bold" | "fill" | "duotone";
  className?: string;
  title?: string;
  active?: boolean;
}

export function IconButton({
  icon: IconComp,
  label,
  onClick,
  size = 18,
  weight = "regular",
  className,
  title,
  active = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={twMerge(
        "inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted transition-colors",
        "hover:text-primary hover:bg-surface-strong active:scale-95",
        active && "text-primary bg-primary-soft",
        className,
      )}
    >
      <IconComp size={size} weight={weight} aria-hidden />
    </button>
  );
}
