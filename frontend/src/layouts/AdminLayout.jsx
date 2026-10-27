import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import Button from "../components/common/Button.jsx";

const LINKS = [
  { to: "/admin", label: "Tổng quan", end: true, mark: "01" },
  { to: "/admin/users", label: "Người dùng", mark: "02" },
  { to: "/admin/approvals", label: "Duyệt tin đăng", mark: "03" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5 lg:px-7 lg:py-7">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500 text-sm font-black text-slate-950" aria-hidden="true">ST</span>
          <div>
            <div className="font-bold tracking-tight">Smart Travel</div>
            <div className="mt-0.5 text-xs text-slate-400">Bảng điều khiển quản trị</div>
          </div>
        </div>
        <div className="hidden px-7 pb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">Không gian quản trị</div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-visible lg:px-4" aria-label="Điều hướng quản trị">
          {LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-black/10 text-[10px] font-bold" aria-hidden="true">{item.mark}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden flex-1 lg:block" />
        <div className="hidden border-t border-slate-800 p-5 lg:block">
          <div className="mb-3 truncate text-sm font-semibold">{user?.username}</div>
          <Button variant="secondary" className="w-full border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={signOut}>
            Đăng xuất
          </Button>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 lg:hidden">
          <span className="truncate text-sm text-slate-300">{user?.username}</span>
          <button onClick={signOut} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800">Đăng xuất</button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quản trị hệ thống</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">Xin chào, {user?.username}</p>
            </div>
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 sm:inline-flex">ADMIN</span>
          </div>
        </header>
        <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
