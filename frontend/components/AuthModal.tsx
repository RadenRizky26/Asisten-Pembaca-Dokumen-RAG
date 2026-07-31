"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Envelope, Lock, SignIn, UserPlus } from "@phosphor-icons/react";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface-sidebar)] border border-[var(--color-hairline)] rounded-xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-hairline-soft)]">
          <h3 className="text-base font-bold text-[var(--color-ink)]">
            {mode === "login" ? "Masuk" : "Daftar"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-canvas)] rounded-md transition-colors"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-sm text-semantic-error bg-semantic-error/10 border border-semantic-error/20 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--color-muted)]">
              Email
            </label>
            <div className="flex items-center gap-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded-md px-3 py-2 focus-within:border-[var(--color-primary)] transition-colors">
              <Envelope
                size={16}
                className="text-[var(--color-muted)] shrink-0"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                required
                className="flex-1 bg-transparent border-none text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted-soft)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--color-muted)]">
              Password
            </label>
            <div className="flex items-center gap-2 bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded-md px-3 py-2 focus-within:border-[var(--color-primary)] transition-colors">
              <Lock
                size={16}
                className="text-[var(--color-muted)] shrink-0"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 karakter"
                required
                minLength={6}
                className="flex-1 bg-transparent border-none text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted-soft)] focus:outline-none"
              />
            </div>
          </div>

          <ShimmerButton
            type="submit"
            disabled={submitting}
            fullWidth
          >
            {submitting ? (
              "Memproses..."
            ) : mode === "login" ? (
              <>
                <SignIn size={16} weight="bold" />
                Masuk
              </>
            ) : (
              <>
                <UserPlus size={16} weight="bold" />
                Daftar
              </>
            )}
          </ShimmerButton>

          <p className="text-xs text-center text-[var(--color-muted)]">
            {mode === "login" ? (
              <>
                Belum punya akun?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className="text-[var(--color-primary)] font-medium hover:underline"
                >
                  Daftar
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-[var(--color-primary)] font-medium hover:underline"
                >
                  Masuk
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
