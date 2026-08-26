"use client";

import { useTheme } from "@/context/ThemeContext";
import { useEffect, useState } from "react";
import { Sun, Moon, Desktop } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

const ORDER = ["system", "dark", "light"] as const;

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  const next = ORDER[(ORDER.indexOf(theme as any) + 1) % ORDER.length];

  const icons: Record<string, React.ReactNode> = {
    system: <Desktop size={18} weight="regular" />,
    dark: <Moon size={18} weight="fill" />,
    light: <Sun size={18} weight="fill" />,
  };

  return (
    <button
      onClick={() => setTheme(next)}
      title={`Tema: ${theme} (klik untuk ${next})`}
      aria-label={`Mode tampilan saat ini: ${theme}. Klik untuk beralih ke ${next}.`}
      className={twMerge(
        "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors",
        "hover:text-primary hover:bg-surface-strong active:scale-95",
      )}
    >
      {icons[theme] ?? icons.system}
    </button>
  );
}
