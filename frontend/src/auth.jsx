import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async () => {
    if (!tokens.access) { setUser(null); setReady(true); return; }
    try { setUser(await api("/auth/me/")); } catch { tokens.clear(); setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  const login = async (username, password) => {
    const t = await api("/auth/login/", { method: "POST", body: { username, password }, auth: false });
    tokens.set(t);
    await loadMe();
  };
  const register = async (form) => {
    await api("/auth/register/", { method: "POST", body: form, auth: false });
    await login(form.username, form.password);
  };
  const logout = () => { tokens.clear(); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>;
}
