import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../layouts/MainLayout.jsx";
import HostLayout from "../layouts/HostLayout.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import SearchPage from "../pages/guest/SearchPage.jsx";
import RoomPage from "../pages/guest/RoomPage.jsx";
import BookingsPage from "../pages/guest/BookingsPage.jsx";
import HostDashboard from "../pages/host/HostDashboard.jsx";
import HostListings from "../pages/host/HostListings.jsx";
import HostCalendar from "../pages/host/HostCalendar.jsx";
import HostPricing from "../pages/host/HostPricing.jsx";
import HostOrders from "../pages/host/HostOrders.jsx";
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";
import AdminUsers from "../pages/admin/AdminUsers.jsx";
import AdminApprovals from "../pages/admin/AdminApprovals.jsx";
import RoleRoute from "./RoleRoute.jsx";

const PARTNER_ROLES = ["HOST", "VEHICLE_OWNER"];

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        <Route index element={<SearchPage />} />
        <Route path="rooms/:id" element={<RoomPage />} />
        <Route path="bookings" element={<RoleRoute roles={["CUSTOMER"]}><BookingsPage /></RoleRoute>} />
        <Route path="host" element={<RoleRoute roles={PARTNER_ROLES}><HostLayout /></RoleRoute>}>
          <Route index element={<HostDashboard />} />
          <Route path="listings" element={<HostListings />} />
          <Route path="calendar" element={<HostCalendar />} />
          <Route path="pricing" element={<HostPricing />} />
          <Route path="orders" element={<HostOrders />} />
        </Route>
      </Route>
      <Route path="/admin" element={<RoleRoute roles={["ADMIN"]}><AdminLayout /></RoleRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="approvals" element={<AdminApprovals />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
