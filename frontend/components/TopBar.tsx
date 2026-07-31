"use client";

import { List } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/IconButton";

interface TopBarProps {
  onOpenSidebar: () => void;
  title: string;
}

export function TopBar({ onOpenSidebar, title }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline-soft px-3 md:hidden">
      <IconButton
        icon={List}
        label="Buka panel"
        onClick={onOpenSidebar}
        className="md:hidden"
      />
      <h1 className="truncate text-body-md font-semibold text-ink">
        {title}
      </h1>
    </header>
  );
}
