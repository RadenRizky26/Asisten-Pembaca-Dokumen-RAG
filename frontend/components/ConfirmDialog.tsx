"use client";

import { X } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/IconButton";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Ya, Hapus",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-hairline bg-surface-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-body-md font-semibold text-ink">{title}</h4>
          <IconButton
            icon={X}
            label="Tutup"
            size={16}
            onClick={onCancel}
            className="-mr-1.5 -mt-1.5"
          />
        </div>
        {message && (
          <p className="mt-2 text-body-sm text-body">{message}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-hairline px-4 py-2 text-body-sm text-body transition-colors hover:bg-surface-strong"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-semantic-error px-4 py-2 text-body-sm font-medium text-white transition-colors hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
