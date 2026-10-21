import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import HostLayout from "./pages/host/HostLayout.jsx";
import HostDashboard from "./pages/host/HostDashboard.jsx";
import HostListings from "./pages/host/HostListings.jsx";
import HostCalendar from "./pages/host/HostCalendar.jsx";
import HostPricing from "./pages/host/HostPricing.jsx";
import HostOrders from "./pages/host/HostOrders.jsx";

const isPartner = (u) => u && ["HOST", "VEHICLE_OWNER", "ADMIN"].includes(u.role);

function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg text-emerald-700">Homestay &amp; Xe</Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              {isPartner(user) && <Link to="/host" className="font-medium text-emerald-700 hover:underline">Quản lý (Host)</Link>}
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

function Protected({ children, partner = false }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (partner && !isPartner(user)) return <Navigate to="/" replace />;
  return children;
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
          <Route path="/host" element={<Protected partner><HostLayout /></Protected>}>
            <Route index element={<HostDashboard />} />
            <Route path="listings" element={<HostListings />} />
            <Route path="calendar" element={<HostCalendar />} />
            <Route path="pricing" element={<HostPricing />} />
            <Route path="orders" element={<HostOrders />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}