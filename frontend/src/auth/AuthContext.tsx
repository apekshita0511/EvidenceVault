import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../api/endpoints";
import { setSessionExpiredHandler, tokenStore } from "../api/client";
import type { User } from "../api/types";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  user: User | null;
  status: Status;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(tokenStore.get() ? "loading" : "anon");
  const [sessionExpired, setSessionExpired] = useState(false);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("anon");
  }, []);

  // A 401 on any request means the token expired or the account vanished.
  useEffect(() => {
    setSessionExpiredHandler(() => { setUser(null); setStatus("anon"); setSessionExpired(true); });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Validate a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi.me()
      .then((r) => { setUser(r.user); setStatus("authed"); })
      .catch(() => { tokenStore.clear(); setStatus("anon"); });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    tokenStore.set(r.token);
    setSessionExpired(false);
    setUser(r.user);
    setStatus("authed");
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    await authApi.register(name, email, password);
    await login(email, password);
  }, [login]);

  const value = useMemo(() => ({ user, status, sessionExpired, login, register, logout }), [user, status, sessionExpired, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}