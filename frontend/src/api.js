const BASE = "/api";

export const tokens = {
  get access() { return localStorage.getItem("access"); },
  get refresh() { return localStorage.getItem("refresh"); },
  set({ access, refresh }) {
    if (access) localStorage.setItem("access", access);
    if (refresh) localStorage.setItem("refresh", refresh);
  },
  clear() { localStorage.removeItem("access"); localStorage.removeItem("refresh"); },
};

async function refreshAccess() {
  if (!tokens.refresh) return false;
  const res = await fetch(`${BASE}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh }),
  });
  if (!res.ok) { tokens.clear(); return false; }
  tokens.set(await res.json());
  return true;
}

function errMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  return Object.entries(data).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join(" | ") || fallback;
}

/** auth:false cho endpoint công khai (tránh gửi token hết hạn -> 401). */
export async function api(path, { method = "GET", body, auth = true } = {}, retried = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && auth && !retried && (await refreshAccess())) {
    return api(path, { method, body, auth }, true);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(errMessage(data, res.statusText)), { status: res.status, data });
  return data;
}
