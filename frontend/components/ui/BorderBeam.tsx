"use client";

import { twMerge } from "tailwind-merge";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  anchor?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
}

export function BorderBeam({
  className,
  size = 200,
  duration = 6,
  anchor = 90,
  borderWidth = 1.5,
  colorFrom = "#f54e00",
  colorTo = "#ffb45c",
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          "--size": `${size}px`,
          "--duration": `${duration}s`,
          "--anchor": `${anchor}%`,
          "--border-width": `${borderWidth}px`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--delay": `-${delay}s`,
        } as React.CSSProperties
      }
      className={twMerge(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        "[border:calc(var(--border-width)*1px)_solid_transparent]",
        "[mask-clip:padding-box,border-box] [mask-composite:intersect]",
        "[mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from var(--border-beam-angle), transparent 0deg, var(--color-from) 40deg, var(--color-to) 90deg, var(--color-from) 140deg, transparent 220deg)",
          animation: "border-beam var(--duration) linear infinite",
          animationDelay: "var(--delay)",
        }}
      />
    </div>
  );
}
