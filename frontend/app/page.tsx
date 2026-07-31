"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import AuthModal from "@/components/AuthModal";
import PDFPreview from "@/components/PDFPreview";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Info, X } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/IconButton";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface ChatSession {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
}

interface Message {
  role: string;
  content: string;
}

export default function Home() {
  const [pertanyaan, setPertanyaan] = useState("");
  const [chat, setChat] = useState<Message[]>([]);
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
  const [showAuth, setShowAuth] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { theme } = useTheme();
  const {
    user,
    sessionId,
    token,
    loading: authLoading,
    logout,
    isAuthenticated,
  } = useAuth();
  const pesanAkhirRef = useRef<HTMLDivElement>(null);

  const authRef = useRef({ sessionId, token });
  authRef.current = { sessionId, token };

  useEffect(() => {
    pesanAkhirRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streamingText]);

  const API = "http://localhost:8000";

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (authRef.current.sessionId)
      headers["X-Session-Id"] = authRef.current.sessionId;
    if (authRef.current.token)
      headers["Authorization"] = `Bearer ${authRef.current.token}`;
    return headers;
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/files`, { headers: authHeaders() });
      const data = await res.json();
      if (data.files) setDaftarFile(data.files);
    } catch (error) {
      console.error("Gagal mengambil daftar file:", error);
    }
  }, [authHeaders]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/chat/sessions`, {
        headers: authHeaders(),
      });
      if (res.ok) setChatSessions(await res.json());
    } catch {}
  }, [authHeaders]);

  useEffect(() => {
    if (!isAuthenticated) {
      setChat([]);
      setActiveChatId(null);
    }
    fetchFiles();
    fetchSessions();
  }, [isAuthenticated, sessionId, fetchFiles, fetchSessions]);

  const createNewChat = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/chat/sessions`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const session = await res.json();
        setChatSessions((prev) => [session, ...prev]);
        setActiveChatId(session.id);
        setChat([]);
      }
    } catch {}
  }, [authHeaders]);

  const deleteChat = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(`${API}/api/chat/sessions/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
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
    },
    [activeChatId, authHeaders],
  );

  const switchChat = useCallback(
    (id: string) => {
      const session = chatSessions.find((s) => s.id === id);
      if (session) {
        setActiveChatId(id);
        setChat(session.messages);
      }
    },
    [chatSessions],
  );

  const saveSession = useCallback(
    async (id: string, title: string, messages: Message[]) => {
      try {
        await fetch(`${API}/api/chat/sessions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ id, title, messages }),
        });
      } catch {}
    },
    [authHeaders],
  );

  const kirimPesan = useCallback(async () => {
    if (!pertanyaan.trim()) return;

    const controller = new AbortController();
    setAbortController(controller);

    const pesanUser: Message = { role: "user", content: pertanyaan };
    const chatBaru = [...chat, pesanUser];
    setChat(chatBaru);
    setPertanyaan("");
    setLoading(true);

    const currentSessionId = activeChatId;
    const title = chat.length === 0 ? pertanyaan.slice(0, 50) : undefined;

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          teks: pesanUser.content,
          selected_files: showDocFilter ? selectedFiles : [],
          history: chat,
          temperature,
          k,
        }),
        signal: controller.signal,
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

      const jawaban =
        accumulated.trim() ||
        "Maaf, saya belum menemukan informasi tersebut di dalam dokumen.";
      const pesanAI: Message = { role: "ai", content: jawaban };
      const chatAkhir = [...chatBaru, pesanAI];
      setChat(chatAkhir);
      setStreamingText("");

      if (currentSessionId) {
        const existingSession = chatSessions.find(
          (s) => s.id === currentSessionId,
        );
        const displayTitle =
          title ?? existingSession?.title ?? "Percakapan baru";
        saveSession(currentSessionId, displayTitle, chatAkhir);

        setChatSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, title: title ?? s.title, messages: chatAkhir }
              : s,
          ),
        );
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      const pesanAI: Message = {
        role: "ai",
        content:
          "Maaf, terjadi kesalahan koneksi ke server. Pastikan backend sudah berjalan.",
      };
      const chatAkhir = [...chatBaru, pesanAI];
      setChat(chatAkhir);
      setStreamingText("");
      if (currentSessionId) {
        const existingSession = chatSessions.find(
          (s) => s.id === currentSessionId,
        );
        saveSession(
          currentSessionId,
          title ?? existingSession?.title ?? "Percakapan baru",
          chatAkhir,
        );
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  }, [
    pertanyaan,
    chat,
    activeChatId,
    chatSessions,
    showDocFilter,
    selectedFiles,
    temperature,
    k,
    authHeaders,
    saveSession,
  ]);

  const uploadFile = async () => {
    if (!file) return toast.error("Pilih file dulu!");

    const uploadPromise = new Promise<string>((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      const doUpload = async () => {
        try {
          const res = await fetch(`${API}/api/upload`, {
            method: "POST",
            headers: authHeaders(),
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) {
            reject(data.detail || "Terjadi kesalahan saat upload.");
            return;
          }

          const namaFile = file.name;
          const maxRetry = 300;
          for (let i = 0; i < maxRetry; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const statusRes = await fetch(
                `${API}/api/upload/status/${encodeURIComponent(namaFile)}`,
                { headers: authHeaders() }
              );
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === "sukses") {
                  setFile(null);
                  setFileInputKey((v) => v + 1);
                  fetchFiles();
                  resolve(`Dokumen "${namaFile}" berhasil ditambahkan!`);
                  return;
                }
                if (statusData.status === "error") {
                  reject(statusData.detail || "Gagal memproses dokumen.");
                  return;
                }
              }
            } catch {
              // backend mungkin sedang sibuk; lanjut polling
            }
          }
          reject("Proses indeks terlalu lama. Coba lagi atau gunakan file yang lebih kecil.");
        } catch {
          reject("Gagal mengupload dokumen. Pastikan backend berjalan.");
        }
      };
      doUpload();
    });

    toast.promise(uploadPromise, {
      loading: "Memproses dokumen...",
      success: (data) => data,
      error: (err) => err,
    });
  };

  const deleteFile = (namaFile: string) => setConfirmDelete(namaFile);

  const executeDelete = async (namaFile: string) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`${API}/api/files/${namaFile}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
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
    const chatText = chat
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    const blob = new Blob([chatText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeSession = chatSessions.find((s) => s.id === activeChatId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      {preview && (
        <PDFPreview
          filename={preview.file}
          pageNumber={preview.page}
          onClose={() => setPreview(null)}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <Toaster
        richColors
        position="top-center"
        theme={theme === "dark" ? "dark" : "light"}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Hapus dokumen?"
          message={`"${confirmDelete}" akan dihapus permanen.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => executeDelete(confirmDelete)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        file={file}
        onFileChange={setFile}
        fileInputKey={fileInputKey}
        onUpload={uploadFile}
        loading={loading}
        daftarFile={daftarFile}
        selectedFiles={selectedFiles}
        onToggleFile={(nama, checked) =>
          setSelectedFiles((prev) =>
            checked
              ? [...prev, nama]
              : prev.filter((f) => f !== nama),
          )
        }
        showDocFilter={showDocFilter}
        onToggleDocFilter={() => setShowDocFilter((v) => !v)}
        onDeleteFile={deleteFile}
        chatSessions={chatSessions}
        activeChatId={activeChatId}
        onSwitchChat={switchChat}
        onNewChat={createNewChat}
        onDeleteChat={deleteChat}
        isAuthenticated={isAuthenticated}
        authLoading={authLoading}
        user={user}
        onLogout={logout}
        onOpenAuth={() => setShowAuth(true)}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        k={k}
        onKChange={setK}
        model={model}
        onModelChange={setModel}
        showCitations={showCitations}
        onToggleCitations={() => setShowCitations((v) => !v)}
        onExportChat={exportChat}
        onOpenTutorial={() => setShowTutorial(true)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          title={activeSession?.title ?? "Asisten Dokumen"}
        />

        <ChatMessages
          chat={chat}
          streamingText={streamingText}
          loading={loading}
          daftarFile={daftarFile}
          showCitations={showCitations}
          pesanAkhirRef={pesanAkhirRef}
          onCitation={(file, page) => setPreview({ file, page })}
        >
          <EmptyState
            daftarFileCount={daftarFile.length}
            onNewChat={createNewChat}
          />
        </ChatMessages>

        <ChatInput
          pertanyaan={pertanyaan}
          onPertanyaanChange={setPertanyaan}
          onSend={kirimPesan}
          onStop={() => abortController?.abort()}
          loading={loading}
        />
      </main>

      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-hairline bg-canvas shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-hairline bg-surface-sidebar p-4">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Info
                  size={24}
                  className="text-primary"
                  weight="fill"
                />
                Buku Panduan & Kamus Istilah AI
              </h3>
              <IconButton
                icon={X}
                label="Tutup"
                onClick={() => setShowTutorial(false)}
              />
            </div>

            <div className="flex flex-col gap-8 overflow-y-auto p-6 text-body-sm leading-relaxed text-body">
              <section>
                <h4 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs text-primary">
                    1
                  </span>
                  Panduan Penggunaan Aplikasi
                </h4>
                <ul className="space-y-4 pl-8 list-decimal marker:font-bold marker:text-primary">
                  <li>
                    <strong>Unggah Dokumen Anda:</strong> Klik area bertuliskan
                    "Pilih file..." di panel sebelah kiri. Anda dapat memasukkan
                    berkas berformat PDF, Word (DOCX), Excel (XLSX), atau
                    presentasi (PPTX). Tunggu hingga muncul notifikasi sukses.
                  </li>
                  <li>
                    <strong>Pilih Dokumen yang Akan Ditanyakan:</strong> Lihat
                    ke bagian "Dokumen Tersimpan" di sebelah kiri. Pastikan
                    Anda <strong>mencentang kotak</strong> di sebelah nama
                    dokumen yang ingin Anda tanyakan. Asisten hanya akan
                    membaca dokumen yang dicentang.
                  </li>
                  <li>
                    <strong>Mulai Chatting:</strong> Ketik pertanyaan Anda di
                    kolom bagian bawah. Tekan <em>Enter</em> atau tombol kirim
                    untuk mengirim pesan.
                  </li>
                  <li>
                    <strong>Cek Sumber Halaman (Bukti Jawaban):</strong> Di
                    dalam teks jawaban asisten, Anda akan melihat tombol kecil
                    (misalnya: <em>namafile.pdf hal 4</em>). Klik tombol
                    tersebut, dan aplikasi akan membuka pratinjau dokumen asli
                    tepat di halaman tempat informasi itu ditemukan.
                  </li>
                </ul>
              </section>

              <hr className="border-hairline-soft" />

              <section>
                <h4 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs text-primary">
                    2
                  </span>
                  Kamus Istilah AI (Bahasa Awam)
                </h4>
                <div className="grid gap-4">
                  <div className="rounded-lg border border-hairline-soft bg-surface-card p-4">
                    <strong className="mb-1 block text-ink">
                      RAG (Sistem Buka Buku)
                    </strong>
                    <p>
                      Ini adalah nama teknologi aplikasi ini. Daripada
                      membiarkan AI menjawab dari ingatannya sendiri (yang
                      kadang bisa mengarang), teknologi RAG memaksa AI untuk
                      "membaca" dokumen Anda dulu dan menjawab berdasarkan
                      teks yang ada di dalamnya.
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline-soft bg-surface-card p-4">
                    <strong className="mb-1 block text-ink">
                      Temperature (Pengaturan Gaya Bahasa)
                    </strong>
                    <p>
                      Angka antara 0 hingga 1 yang menentukan cara asisten
                      menjawab. Jika disetel mendekati <strong>0</strong>,
                      jawaban akan sangat kaku dan persis seperti teks di
                      dokumen. Jika disetel mendekati <strong>1</strong>,
                      asisten akan merangkai kata dengan lebih luwes dan
                      bercerita.
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline-soft bg-surface-card p-4">
                    <strong className="mb-1 block text-ink">
                      Top-K Docs (Batas Bacaan AI)
                    </strong>
                    <p>
                      Menentukan seberapa banyak cuplikan teks yang diambil
                      asisten dari dokumen Anda untuk menjawab satu pertanyaan.
                      Semakin besar angkanya (misal: 10), semakin luas konteks
                      yang dibaca asisten, tetapi prosesnya mungkin sedikit
                      lebih lama.
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline-soft bg-surface-card p-4">
                    <strong className="mb-1 block text-ink">
                      Model AI (Pilihan Tipe Asisten)
                    </strong>
                    <p>
                      Ini adalah pilihan "otak" di balik asisten Anda. Model{" "}
                      <strong>Flash Lite</strong> cocok untuk respons kilat
                      sehari-hari, sedangkan model <strong>Pro</strong> lebih
                      lambat namun jauh lebih pintar dalam menganalisis
                      dokumen yang rumit.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex justify-end border-t border-hairline bg-surface-sidebar p-4">
              <ShimmerButton onClick={() => setShowTutorial(false)}>
                Mengerti
              </ShimmerButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
