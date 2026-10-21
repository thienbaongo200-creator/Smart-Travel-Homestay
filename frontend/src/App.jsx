import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg text-emerald-700">🏡 Homestay &amp; Xe</Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/bookings" className="hover:underline">Đơn của tôi</Link>
              <span className="text-slate-500">{user.username}</span>
              <button onClick={logout} className="text-red-600 hover:underline">Đăng xuất</button>
            </>
          ) : (
            <Link to="/login" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Đăng nhập</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Protected({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
