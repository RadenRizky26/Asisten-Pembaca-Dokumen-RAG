"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import TypingText from "@/components/TypingText";
import ThemeToggle from "@/components/ThemeToggle";
import PDFPreview from "@/components/PDFPreview";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css"; 
import {
  Plus,
  Trash,
  User,
  Sparkle,
  ChatText,
  ArrowUp,
  FileText,
  Sun,
  Moon,
} from "@phosphor-icons/react";

interface ChatSession {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
}

export default function Home() {
  const [pertanyaan, setPertanyaan] = useState("");
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [daftarFile, setDaftarFile] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [notif, setNotif] = useState<{ type: "sukses" | "gagal"; pesan: string } | null>(null);
  const [preview, setPreview] = useState<{ file: string; page: number } | null>(null);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const pesanAkhirRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    pesanAkhirRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streamingText]);

  const API = "http://localhost:8000";

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API}/api/files`);
      const data = await res.json();
      if (data.files) setDaftarFile(data.files);
    } catch (error) {
      console.error("Gagal mengambil daftar file:", error);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API}/api/chat/sessions`);
      if (res.ok) setChatSessions(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchFiles();
    fetchSessions();
  }, []);

  useEffect(() => {
    if (notif) {
      const t = setTimeout(() => setNotif(null), 3500);
      return () => clearTimeout(t);
    }
  }, [notif]);

  const createNewChat = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/chat/sessions`, { method: "POST" });
      if (res.ok) {
        const session = await res.json();
        setChatSessions((prev) => [session, ...prev]);
        setActiveChatId(session.id);
        setChat([]);
      }
    } catch {}
  }, []);

  const deleteChat = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/api/chat/sessions/${id}`, { method: "DELETE" });
    } catch {}
    setChatSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (activeChatId === id) {
        const next = filtered[0] || null;
        setActiveChatId(next ? next.id : null);
        setChat(next ? next.messages : []);
      }
      return filtered;
    });
  }, [activeChatId]);

  const switchChat = useCallback((id: string) => {
    const session = chatSessions.find((s) => s.id === id);
    if (session) {
      setActiveChatId(id);
      setChat(session.messages);
    }
  }, [chatSessions]);

  const saveSession = useCallback(
    async (
      id: string,
      title: string,
      messages: { role: string; content: string }[]
    ) => {
      try {
        await fetch(`${API}/api/chat/sessions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, title, messages }),
        });
      } catch {}
    },
    []
  );

  const kirimPesan = async () => {
    if (!pertanyaan.trim()) return;

    let sessionId = activeChatId;
    if (!sessionId) {
      try {
        const res = await fetch(`${API}/api/chat/sessions`, { method: "POST" });
        if (res.ok) {
          const session = await res.json();
          sessionId = session.id;
          setChatSessions((prev) => [session, ...prev]);
          setActiveChatId(session.id);
        }
      } catch {}
    }

    const pesanUser = { role: "user", content: pertanyaan };
    const chatBaru = [...chat, pesanUser];
    setChat(chatBaru);
    setPertanyaan("");
    setLoading(true);
    setStreamingText("");

    const title =
      chat.length === 0
        ? pertanyaan.length > 40
          ? pertanyaan.slice(0, 40) + "…"
          : pertanyaan
        : null;

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teks: pesanUser.content, selected_files: selectedFiles }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                accumulated += parsed.token;
                setStreamingText(accumulated);
              }
            } catch {}
          }
        }
      }

      const jawaban = accumulated.trim() || "Maaf, saya belum menemukan informasi tersebut di dalam dokumen.";
      const pesanAI = { role: "ai", content: jawaban };
      const chatAkhir = [...chatBaru, pesanAI];
      setChat(chatAkhir);
      setStreamingText("");

      if (sessionId) {
        const existingSession = chatSessions.find((s) => s.id === sessionId);
        const displayTitle = title ?? existingSession?.title ?? "Percakapan baru";
        saveSession(sessionId, displayTitle, chatAkhir);

        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, title: title ?? s.title, messages: chatAkhir }
              : s
          )
        );
      }
    } catch {
      const pesanAI = {
        role: "ai",
        content: "Maaf, terjadi kesalahan koneksi ke server. Pastikan backend sudah berjalan.",
      };
      const chatAkhir = [...chatBaru, pesanAI];
      setChat(chatAkhir);
      setStreamingText("");
      if (sessionId) {
        const existingSession = chatSessions.find((s) => s.id === sessionId);
        saveSession(
          sessionId,
          title ?? existingSession?.title ?? "Percakapan baru",
          chatAkhir
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async () => {
    if (!file) return setNotif({ type: "gagal", pesan: "Pilih file dulu!" });

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setNotif({ type: "gagal", pesan: data.detail || "Terjadi kesalahan saat upload." });
      } else {
        setFile(null);
        setFileInputKey((k) => k + 1);
        fetchFiles();
        setNotif({ type: "sukses", pesan: `Dokumen "${file.name}" berhasil ditambahkan!` });
      }
    } catch {
      setNotif({ type: "gagal", pesan: "Gagal mengupload dokumen. Pastikan backend berjalan." });
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (namaFile: string) => {
    if (!confirm(`Hapus dokumen "${namaFile}"?`)) return;

    try {
      const res = await fetch(`${API}/api/files/${namaFile}`, { method: "DELETE" });
      if (res.ok) {
        fetchFiles();
        setNotif({ type: "sukses", pesan: `${namaFile} berhasil dihapus!` });
      } else {
        setNotif({ type: "gagal", pesan: "Gagal menghapus file." });
      }
    } catch {
      setNotif({ type: "gagal", pesan: "Error koneksi." });
    }
  };

  const formatJawabanAI = (teks: string | undefined | null) => {
    if (!teks) return null;

    // Menangkap (Sumber: NamaFile, halaman 1-2) atau (Sumber: NamaFile, hal 1, 4)
    const processedText = teks.replace(/\(Sumber:\s*(.*?),\s*(?:halaman|hal)\s*([^)]+)\)/gi, (match, p1, p2) => {
      // Ambil angka pertama dari string "1-2" atau "1, 4"
      const firstPageMatch = p2.match(/\d+/);
      const pageNum = firstPageMatch ? firstPageMatch[0] : "1";
      // Bersihkan bintang/formatting markdown yang bocor
      const cleanFileName = p1.replace(/\*/g, '').trim();
      return ` <cite-btn file="${cleanFileName}" page="${pageNum}"></cite-btn> `;
    });

    return (
      <div className="text-[15px] leading-[1.7] text-[var(--color-body)] markdown-container">
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          components={{
            p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-bold text-[var(--color-ink)]" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-4 space-y-2 marker:text-[var(--color-muted)] animate-in fade-in" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-4 space-y-2 marker:text-[var(--color-muted)] animate-in fade-in" {...props} />,
            li: ({ node, ...props }) => <li className="pl-1" {...props} />,
            code: ({ node, ...props }) => (
              <code className="text-[13px] bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded-md font-mono border border-slate-200" {...props} />
            ),
            // Custom tag handling for cite-btn
            "cite-btn": ({ node, file, page, ...props }: any) => {
              if (file && page) {
                 return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreview({ file: file, page: parseInt(page) });
                    }}
                    className="inline-block px-2 py-0.5 mx-1 mb-0.5 rounded-md text-[11px] font-bold font-sans tracking-wide align-middle bg-[var(--color-primary)] text-white border border-[var(--color-primary)]/20 shadow-sm cursor-pointer transition-colors"
                  >
                    {file} (hal {page})
                  </button>
                );
              }
              return null;
            },
            a: ({ node, href, children, ...props }) => {
              return (
                <a 
                  href={href} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800" 
                  {...props}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[var(--color-canvas)] overflow-hidden">
      {preview && <PDFPreview filename={preview.file} pageNumber={preview.page} onClose={() => setPreview(null)} />}

      {/* NOTIFIKASI TOAST */}
      {notif && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-body-sm font-medium transition-all animate-in slide-in-from-right ${
          notif.type === "sukses"
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          <span
            onClick={() => setNotif(null)}
            className="ml-2 cursor-pointer hover:opacity-70 shrink-0 text-lg leading-none"
          >
            ×
          </span>
          <span className="flex-1">{notif.pesan}</span>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="hidden md:flex flex-col w-[280px] bg-[var(--color-surface-sidebar)] border-r border-[var(--color-hairline)] shrink-0 shadow-[1px_0_5px_rgba(0,0,0,0.01)]">
        <div className="flex items-center px-5 h-16 border-b border-[var(--color-hairline-soft)] justify-between">
          <h2 className="text-[18px] font-bold text-[var(--color-ink)]">
            Dokumen <span className="text-[var(--color-primary)]">Pengetahuan</span>
          </h2>
          <ThemeToggle />
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)]">
              Upload File
            </p>
            <div key={fileInputKey} className="relative flex items-center gap-2 cursor-pointer bg-[var(--color-canvas)] rounded-md px-3 py-2 border-2 border-dashed border-[var(--color-hairline)] hover:bg-[var(--color-surface-sidebar)] hover:border-[var(--color-primary)] transition-colors">
              <FileText size={16} className="text-[var(--color-muted)] shrink-0" weight="duotone" />
              <span className="text-[13px] text-[var(--color-muted)] flex-1 truncate">
                {file ? file.name : "Pilih file..."}
              </span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <button
              onClick={uploadFile}
              disabled={loading}
              className="w-full bg-[var(--color-primary)] text-white text-[14px] font-semibold py-2 px-3 rounded-md hover:bg-[var(--color-primary-active)] transition shadow-sm disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Proses Dokumen"}
            </button>
          </div>

          <hr className="border-[var(--color-hairline-soft)]" />

          {/* DOKUMEN INVENTORI */}
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
            <p className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] shrink-0">
              Dokumen Tersimpan
            </p>

            {daftarFile.length === 0 ? (
              <p className="text-[13px] text-[var(--color-muted)] italic bg-[var(--color-canvas)] p-3 rounded-md text-center">
                Belum ada dokumen yang diunggah.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 pr-1">
                {daftarFile.map((namaFile, idx) => {
                  const ext = namaFile.split(".").pop()?.toLowerCase() || "";
                  const dotColor =
                    ext === "pdf"
                      ? "text-red-500"
                      : ext === "docx"
                        ? "text-blue-500"
                        : ext === "xlsx"
                          ? "text-green-500"
                          : "text-orange-500";
                  return (
                      <li
                        key={idx}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--color-canvas)]/50 border border-[var(--color-hairline-soft)] text-[13px] font-medium text-[var(--color-body)] group hover:border-[var(--color-primary)] transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(namaFile)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedFiles([...selectedFiles, namaFile]);
                            else setSelectedFiles(selectedFiles.filter((f) => f !== namaFile));
                          }}
                          className="accent-[var(--color-primary)]"
                        />
                        <FileText
                          size={16}
                          className={`shrink-0 ${dotColor}`}
                          weight="duotone"
                        />
                        <span className="truncate flex-1" title={namaFile}>
                          {namaFile}
                        </span>
                        <button
                          onClick={() => deleteFile(namaFile)}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition p-1"
                        >
                          <Trash size={14} />
                        </button>
                      </li>

                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <hr className="border-[var(--color-hairline-soft)] mx-5" />

        {/* RIWAYAT SESSION CHAT */}
        <div className="flex-1 flex flex-col gap-2 p-5 pt-4 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)]">
              Riwayat Chat
            </p>
            <button
              onClick={createNewChat}
              className="flex items-center gap-1 text-[13px] font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-active)] transition"
            >
              <Plus size={14} weight="bold" />
              Baru
            </button>
          </div>

          <div className="flex-1 overflow-y-auto text-[13px] pr-1">
            {chatSessions.length === 0 ? (
              <p className="text-[var(--color-muted)] italic mt-2">
                Belum ada percakapan.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {chatSessions.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => switchChat(s.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors group ${
                        s.id === activeChatId
                          ? "bg-[var(--color-primary)]/10 text-[var(--color-ink)] font-medium border border-[var(--color-primary)]/20"
                          : "hover:bg-[var(--color-canvas)] text-[var(--color-body)] border border-transparent"
                      }`}
                    >
                      <ChatText
                        size={16}
                        weight="duotone"
                        className="shrink-0 opacity-60"
                      />
                      <span className="truncate flex-1">{s.title}</span>
                      <span
                        onClick={(e) => deleteChat(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition shrink-0 cursor-pointer"
                      >
                        <Trash size={16} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[800px] mx-auto">
            {chat.length === 0 && !streamingText && (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
                <div className="h-16 w-16 bg-white shadow-sm rounded-full flex items-center justify-center mb-5 border border-[var(--color-hairline)] animate-in fade-in zoom-in-75">
                  <ChatText
                    size={28}
                    className="text-[var(--color-muted)]"
                    weight="duotone"
                  />
                </div>
                <h3 className="text-[24px] font-bold text-[var(--color-ink)] mb-2">
                  Asisten Siap
                </h3>
                <p className="text-[15px] text-[var(--color-muted)] max-w-md">
                  Unggah dokumen PDF, Word, Excel, atau PPT di panel sebelah
                  kiri, lalu mulailah bertanya. AI akan menjawab berdasarkan
                  konteks dokumenmu.
                </p>
              </div>
            )}

            {chat.map((msg, i) => (
              <div
                key={i}
                className={`group py-6 px-4 md:px-8 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  i > 0 ? "border-t border-[var(--color-hairline-soft)]" : ""
                } ${msg.role === "user" ? "" : "bg-[var(--color-canvas-soft)]"}`}
              >
                <div className="flex items-start gap-4 max-w-[800px] mx-auto">
                  <div
                    className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 text-white mt-1 shadow-sm ${
                      msg.role === "user"
                        ? "bg-[var(--color-ink)]"
                        : "bg-[var(--color-primary)]"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User size={18} weight="fill" />
                    ) : (
                      <Sparkle size={18} weight="fill" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold tracking-wider uppercase text-[var(--color-muted)] mb-2">
                      {msg.role === "user" ? "Anda" : "Asisten"}
                    </p>
                    {msg.role === "user" ? (
                      <p className="text-[15px] text-[var(--color-ink)] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="font-serif">
                        {formatJawabanAI(msg.content)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* STREAMING LOGIC BAR */}
            {loading && (
              <div className="py-6 px-4 md:px-8 border-t border-[var(--color-hairline-soft)] bg-[var(--color-canvas-soft)] stream-fade-in">
                <div className="flex items-start gap-4 max-w-[800px] mx-auto">
                  <div className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 text-white mt-1 bg-[var(--color-primary)] shadow-sm ai-avatar-generating`}>
                    <Sparkle size={18} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold tracking-wider uppercase text-[var(--color-muted)] mb-2">
                      Asisten
                    </p>
                    <div className="font-serif">
                      {streamingText ? (
                        <>
                          <TypingText text={streamingText} />
                          <span className="inline-block w-[2px] h-[1em] bg-[var(--color-primary)] ml-0.5 animate-pulse align-middle" />
                        </>
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
              </div>
            )}

            <div ref={pesanAkhirRef} />
          </div>
        </div>

        {/* INPUT BAR */}
        <div className="border-t border-[var(--color-hairline-soft)] bg-gradient-to-t from-[var(--color-canvas)] via-[var(--color-canvas)] to-transparent px-4 pt-6 pb-4">
          <div className="max-w-[800px] mx-auto">
            <div className="flex items-center gap-2 bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline)] rounded-xl shadow-sm px-4 py-3 focus-within:border-[var(--color-primary)] focus-within:shadow-md transition-all">
              <input
                type="text"
                value={pertanyaan}
                onChange={(e) => setPertanyaan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && kirimPesan()}
                placeholder="Tanyakan sesuatu dari dokumenmu..."
                className="flex-1 bg-transparent border-none text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-0 font-sans"
              />
              <button
                onClick={kirimPesan}
                disabled={loading || !pertanyaan.trim()}
                className="bg-[var(--color-primary)] text-white p-2 rounded-lg hover:bg-[var(--color-primary-active)] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
              >
                <ArrowUp size={18} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
