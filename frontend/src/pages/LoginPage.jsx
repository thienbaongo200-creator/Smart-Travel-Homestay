import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function LoginPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from || "/";
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ username: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr("");
    try {
      if (mode === "login") await login(f.username, f.password);
      else await register({ ...f, role: "CUSTOMER" });
      nav(from, { replace: true });
    } catch (e2) { setErr(e2.message); }
  }

  const input = "mt-1 w-full border rounded-lg px-3 py-2";
  return (
    <form onSubmit={submit} className="max-w-sm mx-auto bg-white border rounded-xl p-6 space-y-3">
      <h1 className="text-xl font-bold">{mode === "login" ? "Đăng nhập" : "Đăng ký khách hàng"}</h1>
      <label className="block text-sm">Tên đăng nhập<input required value={f.username} onChange={set("username")} className={input} /></label>
      {mode === "register" && (
        <>
          <label className="block text-sm">Email<input required type="email" value={f.email} onChange={set("email")} className={input} /></label>
          <label className="block text-sm">Số điện thoại<input value={f.phone} onChange={set("phone")} className={input} /></label>
        </>
      )}
      <label className="block text-sm">Mật khẩu<input required type="password" minLength={6} value={f.password} onChange={set("password")} className={input} /></label>
      {err && <div className="p-2 rounded bg-red-50 text-red-700 text-sm">{err}</div>}
      <button className="w-full bg-emerald-600 text-white rounded-lg py-2 font-semibold">{mode === "login" ? "Đăng nhập" : "Đăng ký"}</button>
      <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-sm text-emerald-700 hover:underline">
        {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </button>
      {mode === "login" && <div className="text-xs text-slate-500">Demo: khach1 / 123456</div>}
    </form>
  );
}
