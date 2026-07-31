"use client";

import {
  ChatText,
  DownloadSimple,
  FileText,
  Gear,
  Info,
  Plus,
  SignIn,
  SignOut,
  Trash,
  X,
} from "@phosphor-icons/react";
import ThemeToggle from "@/components/ThemeToggle";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { IconButton } from "@/components/ui/IconButton";

interface ChatSession {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  fileInputKey: number;
  onUpload: () => void;
  loading: boolean;
  daftarFile: string[];
  selectedFiles: string[];
  onToggleFile: (nama: string, checked: boolean) => void;
  showDocFilter: boolean;
  onToggleDocFilter: () => void;
  onDeleteFile: (nama: string) => void;
  chatSessions: ChatSession[];
  activeChatId: string | null;
  onSwitchChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  isAuthenticated: boolean;
  authLoading: boolean;
  user: { email: string } | null;
  onLogout: () => void;
  onOpenAuth: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  temperature: number;
  onTemperatureChange: (v: number) => void;
  k: number;
  onKChange: (v: number) => void;
  model: string;
  onModelChange: (v: string) => void;
  showCitations: boolean;
  onToggleCitations: () => void;
  onExportChat: () => void;
  onOpenTutorial: () => void;
}

export function Sidebar({
  isOpen,
  onClose,
  file,
  onFileChange,
  fileInputKey,
  onUpload,
  loading,
  daftarFile,
  selectedFiles,
  onToggleFile,
  showDocFilter,
  onToggleDocFilter,
  onDeleteFile,
  chatSessions,
  activeChatId,
  onSwitchChat,
  onNewChat,
  onDeleteChat,
  isAuthenticated,
  authLoading,
  user,
  onLogout,
  onOpenAuth,
  showSettings,
  onToggleSettings,
  temperature,
  onTemperatureChange,
  k,
  onKChange,
  model,
  onModelChange,
  showCitations,
  onToggleCitations,
  onExportChat,
  onOpenTutorial,
}: SidebarProps) {
  const toggleSwitch = (
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 rounded-full transition-colors shrink-0 ${
        checked ? "bg-primary" : "bg-hairline-strong"
      }`}
      style={{ height: 22 }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );

  const fileExtensionColor = (nama: string) => {
    const ext = nama.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "text-semantic-error";
    if (ext === "docx") return "text-timeline-read";
    if (ext === "xlsx") return "text-semantic-success";
    return "text-timeline-thinking";
  };

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 w-[280px] shrink-0 flex flex-col bg-surface-sidebar border-r border-hairline transition-transform duration-300 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-hairline-soft">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            Dokumen <span className="text-primary">Pengetahuan</span>
          </h2>
          <div className="flex items-center gap-0.5">
            {authLoading ? null : isAuthenticated ? (
              <>
                <span
                  className="text-[11px] text-muted truncate max-w-[90px]"
                  title={user?.email}
                >
                  {user?.email?.split("@")[0]}
                </span>
                <IconButton
                  icon={SignOut}
                  label="Keluar"
                  size={16}
                  weight="bold"
                  onClick={onLogout}
                  className="hover:text-semantic-error"
                />
              </>
            ) : (
              <IconButton
                icon={SignIn}
                label="Masuk / Daftar"
                size={16}
                weight="bold"
                onClick={onOpenAuth}
              />
            )}
            <IconButton
              icon={X}
              label="Tutup panel"
              onClick={onClose}
              className="md:hidden"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          {/* Upload */}
          <section className="flex flex-col gap-2">
            <p className="section-label">Upload File</p>
            <div
              key={fileInputKey}
              className="relative flex items-center gap-2 cursor-pointer bg-canvas rounded-md px-3 py-2.5 border-2 border-dashed border-hairline hover:border-primary transition-colors"
            >
              <FileText
                size={16}
                weight="duotone"
                className="text-muted shrink-0"
              />
              <span className="text-body-sm text-muted flex-1 truncate">
                {file ? file.name : "Pilih file..."}
              </span>
              <input
                type="file"
                aria-label="Pilih file dokumen"
                onChange={(e) =>
                  onFileChange(e.target.files?.[0] || null)
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <ShimmerButton
              onClick={onUpload}
              disabled={loading}
              fullWidth
              className="shadow-sm"
            >
              {loading ? "Memproses..." : "Proses Dokumen"}
            </ShimmerButton>
          </section>

          {/* Dokumen */}
          <section className="flex flex-col gap-2">
            <p className="section-label shrink-0">Dokumen Tersimpan</p>
            {daftarFile.length === 0 ? (
              <p className="text-body-sm text-muted italic bg-canvas p-3 rounded-md text-center">
                Belum ada dokumen yang diunggah.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {daftarFile.map((namaFile, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-canvas/50 border border-hairline-soft text-body-sm font-medium text-body group hover:border-primary transition-all"
                  >
                    {showDocFilter && (
                      <input
                        type="checkbox"
                        aria-label={`Pilih dokumen ${namaFile}`}
                        checked={selectedFiles.includes(namaFile)}
                        onChange={(e) =>
                          onToggleFile(namaFile, e.target.checked)
                        }
                        className="accent-primary size-3.5"
                      />
                    )}
                    <FileText
                      size={16}
                      weight="duotone"
                      className={`shrink-0 ${fileExtensionColor(namaFile)}`}
                    />
                    <span className="truncate flex-1" title={namaFile}>
                      {namaFile}
                    </span>
                    <button
                      onClick={() => onDeleteFile(namaFile)}
                      aria-label={`Hapus ${namaFile}`}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-semantic-error transition p-1"
                    >
                      <Trash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Riwayat Chat */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 px-4 pt-0 border-t border-hairline-soft">
          <div className="flex items-center justify-between pt-3">
            <p className="section-label">Riwayat Chat</p>
            <button
              onClick={onNewChat}
              className="flex items-center gap-1 text-body-sm font-medium text-primary hover:text-primary-active transition"
            >
              <Plus size={14} weight="bold" />
              Baru
            </button>
          </div>

          <div className="flex-1 overflow-y-auto text-body-sm pr-1 pb-3">
            {chatSessions.length === 0 ? (
              <p className="text-muted italic mt-2">Belum ada percakapan.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {chatSessions.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => onSwitchChat(s.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors group ${
                        s.id === activeChatId
                          ? "bg-primary/10 text-ink font-medium border border-primary/20"
                          : "hover:bg-canvas text-body border border-transparent"
                      }`}
                    >
                      <ChatText
                        size={16}
                        weight="duotone"
                        className="shrink-0 opacity-60"
                      />
                      <span className="truncate flex-1">{s.title}</span>
                      <span
                        onClick={(e) => onDeleteChat(s.id, e)}
                        role="button"
                        aria-label={`Hapus percakapan ${s.title}`}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-semantic-error transition shrink-0 cursor-pointer p-0.5"
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

        {/* Bottom Controls */}
        <div className="relative border-t border-hairline-soft p-3 flex items-center justify-between">
          <div className="flex gap-0.5">
            <IconButton
              icon={Gear}
              label="Pengaturan AI"
              onClick={onToggleSettings}
              active={showSettings}
            />
            <IconButton
              icon={DownloadSimple}
              label="Export Chat"
              onClick={onExportChat}
            />
            <IconButton
              icon={Info}
              label="Panduan & Kamus"
              onClick={onOpenTutorial}
            />
          </div>
          <ThemeToggle />
        </div>

        {/* Settings Popup */}
        {showSettings && (
          <div
            className="absolute bottom-14 left-4 z-50 w-[260px] bg-surface-sidebar border border-hairline rounded-xl shadow-2xl p-4 text-body-sm animate-in slide-in-from-bottom-4 fade-in duration-200"
            role="dialog"
            aria-label="Pengaturan AI"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-ink">Pengaturan AI</h4>
              <IconButton
                icon={X}
                label="Tutup pengaturan"
                size={16}
                onClick={onToggleSettings}
              />
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <label
                  className="text-body text-muted cursor-pointer select-none"
                  onClick={onToggleCitations}
                >
                  Citation (Tombol Sumber)
                </label>
                {toggleSwitch(showCitations, onToggleCitations)}
              </div>
              <div className="flex items-center justify-between">
                <label
                  className="text-body text-muted cursor-pointer select-none"
                  onClick={onToggleDocFilter}
                >
                  Filter Dokumen
                </label>
                {toggleSwitch(showDocFilter, onToggleDocFilter)}
              </div>
              <hr className="border-hairline-soft" />
              <div>
                <label className="block text-muted mb-1.5">
                  Temperature (0.0-1.0)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={temperature}
                  onChange={(e) =>
                    onTemperatureChange(parseFloat(e.target.value))
                  }
                  className="w-full px-2 py-1.5 border rounded-md bg-canvas border-hairline-soft text-body text-ink"
                />
                <p className="text-[10px] text-muted mt-1">
                  Semakin tinggi, jawaban lebih kreatif & acak.
                </p>
              </div>
              <div>
                <label className="block text-muted mb-1.5">Top-K Docs</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={k}
                  onChange={(e) => onKChange(parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 border rounded-md bg-canvas border-hairline-soft text-body text-ink"
                />
                <p className="text-[10px] text-muted mt-1">
                  Jumlah dokumen yang diambil sebagai konteks.
                </p>
              </div>
              <div>
                <label className="block text-muted mb-1.5">Model AI</label>
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-md bg-canvas border-hairline-soft text-body text-ink"
                >
                  <option value="gemini-3.1-flash-lite-preview">
                    Gemini 3.1 Flash Lite
                  </option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
            </div>
            <ShimmerButton
              onClick={onToggleSettings}
              fullWidth
              className="mt-4"
            >
              Tutup
            </ShimmerButton>
          </div>
        )}
      </aside>
    </>
  );
}
