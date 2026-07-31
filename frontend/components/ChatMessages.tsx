"use client";

import { Sparkle, User } from "@phosphor-icons/react";
import { MessageContent } from "@/components/MessageContent";

interface Message {
  role: string;
  content: string;
}

interface ChatMessagesProps {
  chat: Message[];
  streamingText: string;
  loading: boolean;
  daftarFile: string[];
  showCitations: boolean;
  pesanAkhirRef: React.RefObject<HTMLDivElement | null>;
  onCitation: (file: string, page: number) => void;
  children?: React.ReactNode;
}

export function ChatMessages({
  chat,
  streamingText,
  loading,
  daftarFile,
  showCitations,
  pesanAkhirRef,
  onCitation,
  children,
}: ChatMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px]">
        {chat.length === 0 && !streamingText && children}

        {chat.map((msg, i) => (
          <div
            key={i}
            className={`group py-6 px-4 md:px-8 ${
              i > 0 ? "border-t border-hairline-soft" : ""
            } ${
              msg.role === "user" ? "" : "bg-canvas-soft"
            }`}
          >
            <div className="mx-auto flex items-start gap-4 max-w-[760px]">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white mt-1 shadow-sm ${
                  msg.role === "user" ? "bg-ink" : "bg-primary"
                }`}
              >
                {msg.role === "user" ? (
                  <User size={18} weight="fill" />
                ) : (
                  <Sparkle size={18} weight="fill" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="mb-2 text-[12px] font-bold tracking-wider uppercase text-muted">
                  {msg.role === "user" ? "Anda" : "Asisten"}
                </p>
                {msg.role === "user" ? (
                  <p className="text-body-md text-ink leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                ) : (
                  <MessageContent
                    teks={msg.content}
                    daftarFile={daftarFile}
                    showCitations={showCitations}
                    onCitation={onCitation}
                  />
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="py-6 px-4 md:px-8 border-t border-hairline-soft bg-canvas-soft">
            <div className="mx-auto flex items-start gap-4 max-w-[760px]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white mt-1 bg-primary shadow-sm ai-avatar-generating">
                <Sparkle size={18} weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="mb-2 text-[12px] font-bold tracking-wider uppercase text-muted">
                  Asisten
                </p>
                {streamingText ? (
                  <MessageContent
                    teks={streamingText}
                    daftarFile={daftarFile}
                    showCitations={showCitations}
                    streaming
                    onCitation={onCitation}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={pesanAkhirRef} />
      </div>
    </div>
  );
}
