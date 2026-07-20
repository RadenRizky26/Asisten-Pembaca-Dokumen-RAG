"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useTheme } from "next-themes";
import ThemeToggle from "@/components/ThemeToggle";
import PDFPreview from "@/components/PDFPreview";
import TypingText from "@/components/TypingText";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css"; 
import { Toaster, toast } from "sonner";
import { Gear, Plus, Trash, User, Sparkle, ChatText, ArrowUp, FileText, Sun, Moon, DownloadSimple, X, Info } from "@phosphor-icons/react";

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
  const [preview, setPreview] = useState<{ file: string; page: number } | null>(null);

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [temperature, setTemperature] = useState(0.5);
  const [k, setK] = useState(10);
  const [model, setModel] = useState("gemini-3.1-flash-lite-preview");
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCitations, setShowCitations] = useState(true);
  const [showDocFilter, setShowDocFilter] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const { theme } = useTheme();
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

    const controller = new AbortController();
    setAbortController(controller);

    const pesanUser: { role: string; content: string } = {
      role: "user",
      content: pertanyaan,
    };
    const chatBaru = [...chat, pesanUser];
    setChat(chatBaru);
    setPertanyaan("");
    setLoading(true);

    const sessionId = activeChatId;
    const title = chat.length === 0 ? pertanyaan.slice(0, 50) : undefined;

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          teks: pesanUser.content, 
          selected_files: showDocFilter ? selectedFiles : [],
          history: chat,
          temperature,
          k 
        }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error("Server error");

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
    } catch (e: any) {
      if (e.name === "AbortError") return;
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
      setAbortController(null);
    }
  };

  const uploadFile = async () => {
    if (!file) return toast.error("Pilih file dulu!");

    const uploadPromise = new Promise(async (resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`${API}/api/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          reject(data.detail || "Terjadi kesalahan saat upload.");
        } else {
          setFile(null);
          setFileInputKey((k) => k + 1);
          fetchFiles();
          resolve(`Dokumen "${file.name}" berhasil ditambahkan!`);
        }
      } catch {
        reject("Gagal mengupload dokumen. Pastikan backend berjalan.");
      }
    });

    toast.promise(uploadPromise, {
      loading: "Memproses dokumen...",
      success: (data) => data as string,
      error: (err) => err,
    });
  };

  const deleteFile = (namaFile: string) => setConfirmDelete(namaFile);

  const executeDelete = async (namaFile: string) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`${API}/api/files/${namaFile}`, { method: "DELETE" });
      if (res.ok) {
        fetchFiles();
        toast.success(`${namaFile} berhasil dihapus!`);
      } else {
        toast.error("Gagal menghapus file.");
      }
    } catch {
      toast.error("Error koneksi.");
    }
  };

  const exportChat = () => {
    const chatText = chat.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const blob = new Blob([chatText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  };
  const formatJawabanAI = (teks: string) => {
    if (!teks) return null;

    let processedText = teks;

    if (showCitations) {
      // Fungsi untuk mencari nama file asli yang paling mendekati dari daftarFile
      const findRealFileName = (citedName: string) => {
        // 1. Coba kecocokan pasti (exact match)
        if (daftarFile.includes(citedName)) return citedName;
        if (daftarFile.includes(`${citedName}.pdf`)) return `${citedName}.pdf`;
        
        // 2. Bersihkan nama kutipan dari spasi ekstra atau titik-titik
        const cleanCited = citedName.replace(/\*/g, '').trim().toLowerCase();
        
        // 3. Coba cari jika nama kutipan adalah bagian dari nama file asli (substring)
        for (const file of daftarFile) {
          if (file.toLowerCase().includes(cleanCited)) return file;
        }

        // 4. Jika masih tidak ketemu, coba pecah per kata (fuzzy match sederhana)
        const words = cleanCited.replace(/&/g, ' ').split(/\s+/).filter(w => w.length > 2);
        for (const file of daftarFile) {
          const fileLower = file.toLowerCase();
          // Jika 2 kata atau lebih dari kutipan ada di nama file, anggap itu filenya
          const matches = words.filter(w => fileLower.includes(w));
          if (matches.length >= Math.min(2, words.length) && words.length > 0) return file;
        }

        return cleanCited; // Fallback jika tidak ketemu
      };

      processedText = teks.replace(/\(Sumber:\s*(.*?),\s*(?:halaman|hal)\s*([^)]+)\)/gi, (match, p1, p2) => {
        const firstPageMatch = p2.match(/\d+/);
        const pageNum = firstPageMatch ? firstPageMatch[0] : "1";
        const cleanFileName = findRealFileName(p1);
        return ` <cite-btn file="${cleanFileName}" page="${pageNum}" raw-name="${p1}"></cite-btn> `;
      });
    }

    return (
      <div className="text-[15px] leading-[1.7] text-[var(--color-body)] markdown-container">
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          components={{
            p: (props: any) => <p className="mb-4 last:mb-0" {...props} />,
            strong: (props: any) => <strong className="font-bold text-[var(--color-ink)]" {...props} />,
            ul: (props: any) => <ul className="list-disc pl-6 my-4 space-y-2 marker:text-[var(--color-muted)] animate-in fade-in" {...props} />,
            ol: (props: any) => <ol className="list-decimal pl-6 my-4 space-y-2 marker:text-[var(--color-muted)] animate-in fade-in" {...props} />,
            li: (props: any) => <li className="pl-1" {...props} />,
            code: (props: any) => (
              <code className="text-[13px] bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded-md font-mono border border-slate-200" {...props} />
            ),
            "cite-btn": (props: any) => {
              if (props.file && props.page) {
                // Tampilkan raw-name (seperti yang ditulis AI) jika ada, agar tetap sinkron tampilannya
                const displayText = props['raw-name'] ? props['raw-name'].replace(/\*/g, '').trim() : props.file;
                return (
                  <button
                    type="button"
                    onClick={() => setPreview({ file: props.file, page: parseInt(props.page) })}
                    className="inline-block px-2 py-0.5 mx-1 mb-0.5 rounded-md text-[11px] font-bold font-sans tracking-wide align-middle bg-[var(--color-primary)] text-white border border-[var(--color-primary)]/20 shadow-sm cursor-pointer transition-colors"
                  >
                    {displayText} (hal {props.page})
                  </button>
                );
              }
              return null;
            },
            a: (props: any) => (
              <a
                href={props.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
                {...props}
              >
                {props.children}
              </a>
            ),
          } as any}
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
        <Toaster richColors position="top-center" theme={theme === "dark" ? "dark" : "light"} />


      {/* MODAL KONFIRMASI HAPUS */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
            <p className="text-sm font-medium mb-4 text-gray-900 dark:text-gray-100">
              Hapus dokumen "{confirmDelete}"?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => executeDelete(confirmDelete)}
                className="px-4 py-2 text-xs rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="hidden md:flex flex-col w-[280px] bg-[var(--color-surface-sidebar)] border-r border-[var(--color-hairline)] shrink-0 shadow-[1px_0_5px_rgba(0,0,0,0.01)]">
        {/* HEADER SIDEBAR (Judul Saja) */}
        <div className="flex items-center px-5 h-16 border-b border-[var(--color-hairline-soft)] justify-between">
          <h2 className="text-[20px] font-bold text-[var(--color-ink)]">
            Dokumen <span className="text-[var(--color-primary)]">Pengetahuan</span>
          </h2>
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
                        {showDocFilter && (
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(namaFile)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFiles([...selectedFiles, namaFile]);
                              else setSelectedFiles(selectedFiles.filter((f) => f !== namaFile));
                            }}
                            className="accent-[var(--color-primary)]"
                          />
                        )}
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

        {/* BOTTOM CONTROLS */}
        <div className="border-t border-[var(--color-hairline-soft)] p-4 flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Gear size={18} /></button>
            <button onClick={exportChat} className="p-2 text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Export Chat"><DownloadSimple size={18} /></button>
            <button onClick={() => setShowTutorial(true)} className="p-2 text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Panduan & Kamus"><Info size={18} /></button>
          </div>
          <ThemeToggle />
        </div>

        {/* SETTINGS POPUP */}
        {showSettings && (
          <div className="absolute bottom-16 left-5 w-[260px] bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline)] rounded-xl shadow-2xl p-4 text-[12px] animate-in slide-in-from-bottom-4 fade-in duration-200">
            <h4 className="font-bold mb-3 text-[var(--color-ink)]">Pengaturan AI</h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[var(--color-muted)] cursor-pointer select-none" onClick={() => setShowCitations(!showCitations)}>Citation (Tombol Sumber):</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showCitations}
                  onClick={() => setShowCitations(!showCitations)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${showCitations ? 'bg-[var(--color-primary)]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showCitations ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[var(--color-muted)] cursor-pointer select-none" onClick={() => setShowDocFilter(!showDocFilter)}>Filter Dokumen:</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showDocFilter}
                  onClick={() => setShowDocFilter(!showDocFilter)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${showDocFilter ? 'bg-[var(--color-primary)]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showDocFilter ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <hr className="border-[var(--color-hairline-soft)] my-1" />
              <div>
                <label className="block text-[var(--color-muted)] mb-1">Temperature (0.0-1.0):</label>
                <input type="number" step="0.1" min="0" max="1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full p-1 border rounded bg-[var(--color-canvas)]/50 border border-[var(--color-hairline-soft)]" />
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Semakin tinggi, jawaban lebih kreatif & acak.</p>
              </div>
              <div>
                <label className="block text-[var(--color-muted)] mb-1">Top-K Docs:</label>
                <input type="number" min="1" max="20" value={k} onChange={(e) => setK(parseInt(e.target.value))} className="w-full p-1 border rounded bg-[var(--color-canvas)]/50 border border-[var(--color-hairline-soft)]" />
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Jumlah dokumen yang diambil sebagai konteks.</p>
              </div>
              <div>
                <label className="block text-[var(--color-muted)] mb-1">Model AI:</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full p-1 border rounded bg-[var(--color-canvas)]/50 border border-[var(--color-hairline-soft)]">
                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="mt-4 w-full bg-[var(--color-primary)] text-white text-[14px] font-semibold py-2 px-3 rounded-md  hover:bg-[var(--color-primary-active)] transition ">Tutup</button>
          </div>
        )}
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
                          <TypingText text={streamingText} formatJawabanAI={formatJawabanAI} />
                          <span className="inline-block w-[2px] h-[1em] bg-[var(--color-primary)] ml-0.5 animate-pulse align-middle" />
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
        <div className="mt-auto border-t border-[var(--color-hairline-soft)] p-4 flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Gear size={18} /></button>
            <button onClick={exportChat} className="p-2 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><DownloadSimple size={18} /></button>
          </div>
          <ThemeToggle />
        </div>
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
                onClick={loading ? () => abortController?.abort() : kirimPesan}
                className={`p-2 rounded-lg transition shadow-sm shrink-0 ${
                  loading ? "bg-red-500 hover:bg-red-600 text-white" : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-active)]"
                }`}
              >
                {loading ? <X size={18} weight="bold" /> : <ArrowUp size={18} weight="bold" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TUTORIAL POPUP MODAL (Diletakkan di level atas agar menutupi semuanya) */}
      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-hairline)] bg-[var(--color-surface-sidebar)]">
              <h3 className="text-lg font-bold text-[var(--color-ink)] flex items-center gap-2">
                <Info size={24} className="text-[var(--color-primary)]" weight="fill" />
                Buku Panduan & Kamus Istilah AI
              </h3>
              <button onClick={() => setShowTutorial(false)} className="p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-canvas)] rounded-md transition-colors">
                <X size={20} weight="bold" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex flex-col gap-8 text-[14px] leading-relaxed text-[var(--color-body)]">
              
              {/* Panduan */}
              <section>
                <h4 className="text-base font-bold text-[var(--color-ink)] mb-4 flex items-center gap-2">
                  <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] w-6 h-6 rounded flex items-center justify-center text-xs">1</span>
                  Panduan Penggunaan Aplikasi
                </h4>
                <ul className="space-y-4 pl-8 list-decimal marker:text-[var(--color-primary)] marker:font-bold">
                  <li>
                    <strong>Unggah Dokumen Anda:</strong> Klik area bertuliskan "Pilih file..." di panel sebelah kiri. Anda dapat memasukkan berkas berformat PDF, Word (DOCX), Excel (XLSX), atau presentasi (PPTX). Tunggu hingga muncul notifikasi sukses.
                  </li>
                  <li>
                    <strong>Pilih Dokumen yang Akan Ditanyakan:</strong> Lihat ke bagian "Dokumen Tersimpan" di sebelah kiri. Pastikan Anda <strong>mencentang kotak</strong> di sebelah nama dokumen yang ingin Anda tanyakan. Asisten hanya akan membaca dokumen yang dicentang.
                  </li>
                  <li>
                    <strong>Mulai Chatting:</strong> Ketik pertanyaan Anda di kolom bagian bawah. Tekan <em>Enter</em> atau tombol panah ke atas untuk mengirim pesan.
                  </li>
                  <li>
                    <strong>Cek Sumber Halaman (Bukti Jawaban):</strong> Di dalam teks jawaban asisten, Anda akan melihat tombol kecil (misalnya: <em>namafile.pdf hal 4</em>). Klik tombol tersebut, dan aplikasi akan membuka pratinjau dokumen asli tepat di halaman tempat informasi itu ditemukan.
                  </li>
                </ul>
              </section>

              <hr className="border-[var(--color-hairline-soft)]" />

              {/* Kamus */}
              <section>
                <h4 className="text-base font-bold text-[var(--color-ink)] mb-4 flex items-center gap-2">
                  <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] w-6 h-6 rounded flex items-center justify-center text-xs">2</span>
                  Kamus Istilah AI (Bahasa Awam)
                </h4>
                <div className="grid gap-4">
                  <div className="p-4 rounded-lg bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline-soft)]">
                    <strong className="text-[var(--color-ink)] block mb-1">RAG (Sistem Buka Buku)</strong>
                    <p>Ini adalah nama teknologi aplikasi ini. Daripada membiarkan AI menjawab dari ingatannya sendiri (yang kadang bisa mengarang), teknologi RAG memaksa AI untuk "membaca" dokumen Anda dulu dan menjawab berdasarkan teks yang ada di dalamnya.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline-soft)]">
                    <strong className="text-[var(--color-ink)] block mb-1">Temperature (Pengaturan Gaya Bahasa)</strong>
                    <p>Angka antara 0 hingga 1 yang menentukan cara asisten menjawab. Jika disetel mendekati <strong>0</strong>, jawaban akan sangat kaku dan persis seperti teks di dokumen. Jika disetel mendekati <strong>1</strong>, asisten akan merangkai kata dengan lebih luwes dan bercerita.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline-soft)]">
                    <strong className="text-[var(--color-ink)] block mb-1">Top-K Docs (Batas Bacaan AI)</strong>
                    <p>Menentukan seberapa banyak cuplikan teks yang diambil asisten dari dokumen Anda untuk menjawab satu pertanyaan. Semakin besar angkanya (misal: 10), semakin luas konteks yang dibaca asisten, tetapi prosesnya mungkin sedikit lebih lama.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline-soft)]">
                    <strong className="text-[var(--color-ink)] block mb-1">Model AI (Pilihan Tipe Asisten)</strong>
                    <p>Ini adalah pilihan "otak" di balik asisten Anda. Model <strong>Flash Lite</strong> cocok untuk respons kilat sehari-hari, sedangkan model <strong>Pro</strong> lebih lambat namun jauh lebih pintar dalam menganalisis dokumen yang rumit.</p>
                  </div>
                </div>
              </section>

            </div>
            <div className="p-4 border-t border-[var(--color-hairline)] bg-[var(--color-surface-sidebar)] flex justify-end">
              <button onClick={() => setShowTutorial(false)} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-md font-medium hover:bg-[var(--color-primary-active)] transition-colors">
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
