"use client";

import { ChatCircleText, FilePlus, Plus } from "@phosphor-icons/react";
import { WordPullUp } from "@/components/ui/WordPullUp";

interface EmptyStateProps {
  daftarFileCount: number;
  onNewChat: () => void;
}

export function EmptyState({
  daftarFileCount,
  onNewChat,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-hairline bg-surface-card dark:bg-[#161618] shadow-sm">
        <ChatCircleText
          size={30}
          weight="duotone"
          className="text-primary"
        />
      </div>

      <WordPullUp
        words="Asisten Siap Membantu"
        className="text-[26px] font-bold text-ink dark:text-gray-100 md:text-[32px]"
      />

      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted dark:text-gray-400">
        Unggah dokumen PDF, Word, Excel, atau PPT di panel sebelah kiri,
        lalu mulailah bertanya. AI akan menjawab berdasarkan konteks
        dokumenmu.
      </p>

      {daftarFileCount > 0 ? (
        <button
          onClick={onNewChat}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-card dark:bg-[#161618] px-5 py-2.5 text-body-sm font-medium text-body dark:text-gray-300 shadow-sm transition-colors hover:border-primary hover:text-primary dark:hover:text-primary"
        >
          <Plus size={16} weight="bold" />
          Mulai Percakapan Baru
        </button>
      ) : (
        <p className="mt-8 flex items-center gap-2 rounded-full border border-dashed border-hairline-strong px-5 py-2.5 text-body-sm text-muted dark:text-gray-400">
          <FilePlus size={16} />
          Unggah dokumen untuk mulai bertanya
        </p>
      )}

      <p className="mt-12 text-[11px] uppercase tracking-widest text-muted-soft dark:text-gray-500">
        RAG Document Assistant
      </p>
    </div>
  );
}
