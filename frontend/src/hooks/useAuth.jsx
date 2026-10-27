import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokens } from "../services/api.js";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async () => {
    if (!tokens.access) { setUser(null); setReady(true); return null; }
    let currentUser = null;
    try {
      currentUser = await api("/auth/me/");
      setUser(currentUser);
    } catch {
      tokens.clear();
      setUser(null);
    }
    setReady(true);
    return currentUser;
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  const login = async (username, password) => {
    const t = await api("/auth/login/", { method: "POST", body: { username, password }, auth: false });
    tokens.set(t);
    return loadMe();
  };
  const register = async (form) => {
    await api("/auth/register/", { method: "POST", body: form, auth: false });
    return login(form.username, form.password);
  };
  const logout = () => { tokens.clear(); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>;
}
