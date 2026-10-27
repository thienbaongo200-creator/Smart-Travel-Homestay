import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import Button from "../components/common/Button.jsx";

export default function MainLayout() {
  const { user, logout } = useAuth();
  if (user?.role === "ADMIN") return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-800 text-sm font-bold text-white" aria-hidden="true">ST</span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-slate-950 sm:text-base">Smart Travel</span>
              <span className="hidden text-xs text-slate-500 sm:block">Homestay &amp; trải nghiệm</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Điều hướng chính">
            {user?.role === "HOST" || user?.role === "VEHICLE_OWNER" ? (
              <Link to="/host" className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">
                Kênh đối tác
              </Link>
            ) : null}
            {user?.role === "CUSTOMER" && (
              <Link to="/bookings" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Đơn đặt
              </Link>
            )}
            {user ? (
              <>
                <span className="hidden max-w-36 truncate text-sm text-slate-600 sm:inline">{user.username}</span>
                <Button variant="secondary" className="min-h-10 px-3 py-2" onClick={logout}>Đăng xuất</Button>
              </>
            ) : (
              <Link to="/login" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900">
                Đăng nhập
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Smart Travel Homestay</span>
          <span>Ở địa phương, đi muôn nơi.</span>
        </div>
      </footer>
    </div>
  );
}
