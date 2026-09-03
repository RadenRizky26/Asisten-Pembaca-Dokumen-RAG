const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function apiRegister(
  email: string,
  password: string,
  sessionId: string | null
) {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      session_id: sessionId || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Registrasi gagal");
  return data;
}

export async function apiLogin(
  email: string,
  password: string,
  sessionId: string | null
) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      session_id: sessionId || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login gagal");
  return data;
}

export async function apiGetMe(token: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) return null;
  return data;
}
