"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiRegister, apiLogin, apiGetMe } from "@/lib/api";

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  sessionId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const defaultContext: AuthContextType = {
  user: null,
  token: null,
  sessionId: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  isAuthenticated: false,
};

const AuthContext = createContext<AuthContextType>(defaultContext);

function generateSessionId(): string {
  return "guest_" + crypto.randomUUID();
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("guest_session_id");
  if (!sid) {
    sid = generateSessionId();
    localStorage.setItem("guest_session_id", sid);
  }
  return sid;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function storeToken(token: string) {
  localStorage.setItem("auth_token", token);
}

function clearToken() {
  localStorage.removeItem("auth_token");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    const savedToken = getStoredToken();
    if (savedToken) {
      apiGetMe(savedToken).then((u) => {
        if (u) {
          setUser(u);
          setToken(savedToken);
        } else {
          clearToken();
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRegister(email, password, getOrCreateSessionId());
    storeToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password, getOrCreateSessionId());
    storeToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    const newSid = generateSessionId();
    localStorage.setItem("guest_session_id", newSid);
    setSessionId(newSid);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        sessionId,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
