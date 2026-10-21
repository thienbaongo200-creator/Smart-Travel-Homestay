import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth.jsx";

const TABS = {
  HOST: [["/host", "Tổng quan", true], ["/host/listings", "Homestay & phòng"], ["/host/calendar", "Lịch phòng"], ["/host/pricing", "Giá động"], ["/host/orders", "Đơn đặt"]],
  VEHICLE_OWNER: [["/host", "Tổng quan", true], ["/host/listings", "Xe của tôi"], ["/host/calendar", "Lịch xe"], ["/host/pricing", "Giá & combo"], ["/host/orders", "Đơn thuê xe"]],
};

export default function HostLayout() {
  const { user } = useAuth();
  const tabs = TABS[user.role === "VEHICLE_OWNER" ? "VEHICLE_OWNER" : "HOST"];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${isActive ? "border-emerald-600 text-emerald-700 font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}