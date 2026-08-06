"use client";

import { useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "@phosphor-icons/react";
import { BorderBeam } from "@/components/ui/BorderBeam";

interface ChatInputProps {
  pertanyaan: string;
  onPertanyaanChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  loading: boolean;
  disabled?: boolean;
  promptHistory?: string[];
}

export function ChatInput({
  pertanyaan,
  onPertanyaanChange,
  onSend,
  onStop,
  loading,
  disabled = false,
  promptHistory = [],
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyIndex = useRef<number>(promptHistory.length);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [pertanyaan]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) {
        onSend();
        historyIndex.current = promptHistory.length + 1;
      }
    } else if (e.key === "ArrowUp") {
      if (historyIndex.current > 0) {
        e.preventDefault();
        historyIndex.current -= 1;
        onPertanyaanChange(promptHistory[historyIndex.current]);
      }
    } else if (e.key === "ArrowDown") {
      if (historyIndex.current < promptHistory.length - 1) {
        e.preventDefault();
        historyIndex.current += 1;
        onPertanyaanChange(promptHistory[historyIndex.current]);
      } else {
        historyIndex.current = promptHistory.length;
        onPertanyaanChange("");
      }
    }
  };

  const canSend = (pertanyaan ?? "").trim().length > 0 && !loading;

  return (
    <div className="px-4 pb-4 pt-2 md:pb-6">
      <div className="mx-auto max-w-[760px]">
        <div className="relative rounded-2xl">
          <div className="flex items-end gap-2 rounded-2xl border border-hairline bg-surface-card px-3.5 py-2.5 shadow-sm transition-shadow focus-within:!border-transparent focus-within:!ring-0 focus-within:shadow-md">
            <textarea
              ref={textareaRef}
              value={pertanyaan}
              onChange={(e) => onPertanyaanChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Tanyakan sesuatu dari dokumenmu..."
              disabled={disabled}
              className="min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-ink placeholder:text-muted focus:!outline-none focus:!ring-0 disabled:opacity-50 max-h-[200px]"
            />
            <button
              type="button"
              onClick={loading ? onStop : onSend}
              disabled={disabled && !loading}
              aria-label={loading ? "Hentikan jawaban" : "Kirim pesan"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 ${
                loading
                  ? "bg-surface-strong text-ink hover:bg-hairline-strong"
                  : canSend
                    ? "bg-primary text-white hover:bg-primary-active shadow-sm"
                    : "bg-surface-strong text-muted"
              }`}
            >
              {loading ? (
                <Square size={16} weight="fill" />
              ) : (
                <ArrowUp size={18} weight="bold" />
              )}
            </button>
          </div>
          {canSend && !loading && (
            <BorderBeam
              size={220}
              duration={5}
              anchor={85}
              borderWidth={1.5}
            />
          )}
        </div>
      </div>
    </div>
  );
}
