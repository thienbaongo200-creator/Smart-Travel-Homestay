import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.jsx";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { roleHome } from "../../routes/RoleRoute.jsx";

const INPUT = "mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", phone: "", password: "", role: "CUSTOMER" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const currentUser = mode === "login"
        ? await login(form.username, form.password)
        : await register(form);
      const intendedPath = location.state?.from;
      const target = currentUser?.role === "ADMIN"
        ? roleHome("ADMIN")
        : intendedPath || roleHome(currentUser?.role);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-12rem)] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden px-6 py-10 lg:block">
        <div className="max-w-xl">
          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-900">Đi cùng Smart Travel</span>
          <h1 className="mt-6 text-5xl font-bold leading-[1.08] tracking-tight text-slate-950">Một nơi ở tốt, mở đầu cho chuyến đi đáng nhớ.</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">Tìm homestay phù hợp, xem lịch trống rõ ràng và đặt phòng thuận tiện trên mọi thiết bị.</p>
          <div className="mt-9 flex gap-3 text-sm text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2">Lịch trống trực quan</span>
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2">Giá minh bạch</span>
          </div>
        </div>
      </section>

      <Card className="mx-auto w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-emerald-800">{mode === "login" ? "CHÀO MỪNG TRỞ LẠI" : "TẠO TÀI KHOẢN"}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{mode === "login" ? "Đăng nhập" : "Đăng ký tài khoản"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {mode === "login" ? "Đăng nhập bằng tên tài khoản để tiếp tục." : "Tạo tài khoản để bắt đầu hành trình của bạn."}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Tên đăng nhập
            <input autoComplete="username" required value={form.username} onChange={set("username")} className={INPUT} />
          </label>
          {mode === "register" && (
            <>
              <label className="block text-sm font-semibold text-slate-700">
                Email
                <input autoComplete="email" required type="email" value={form.email} onChange={set("email")} className={INPUT} />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Số điện thoại <span className="font-normal text-slate-500">(không bắt buộc)</span>
                <input autoComplete="tel" value={form.phone} onChange={set("phone")} className={INPUT} />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Bạn đăng ký với vai trò
                <select value={form.role} onChange={set("role")} className={INPUT}>
                  <option value="CUSTOMER">Khách hàng</option>
                  <option value="HOST">Chủ homestay</option>
                  <option value="VEHICLE_OWNER">Chủ xe</option>
                </select>
              </label>
            </>
          )}
          <label className="block text-sm font-semibold text-slate-700">
            Mật khẩu
            <input autoComplete={mode === "login" ? "current-password" : "new-password"} required type="password" minLength={6} value={form.password} onChange={set("password")} className={INPUT} />
          </label>
          <Alert>{error}</Alert>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </Button>
        </form>
        <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
          {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
          <button
            type="button"
            className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
            onClick={() => { setError(""); setMode(mode === "login" ? "register" : "login"); }}
          >
            {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
          </button>
        </div>
        {mode === "login" && (
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Tài khoản demo: khach1 / host1 / xe1 / khach2 (123456), admin (admin123)
          </p>
        )}
        <Link to="/" className="mt-5 block text-center text-sm font-medium text-slate-600 hover:text-emerald-800">
          ← Trở về trang tìm kiếm
        </Link>
      </Card>
    </div>
  );
}
