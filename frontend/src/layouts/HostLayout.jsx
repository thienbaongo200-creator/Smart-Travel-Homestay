import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

const TABS = {
  HOST: [["/host", "Tổng quan", "01", true], ["/host/listings", "Chỗ nghỉ & phòng", "02"], ["/host/calendar", "Lịch phòng", "03"], ["/host/pricing", "Giá linh hoạt", "04"], ["/host/orders", "Đơn đặt", "05"]],
  VEHICLE_OWNER: [["/host", "Tổng quan", "01", true], ["/host/listings", "Phương tiện", "02"], ["/host/calendar", "Lịch xe", "03"], ["/host/pricing", "Giá & ưu đãi", "04"], ["/host/orders", "Đơn thuê xe", "05"]],
};

export default function HostLayout() {
  const { user } = useAuth();
  const tabs = TABS[user.role === "VEHICLE_OWNER" ? "VEHICLE_OWNER" : "HOST"];
  const isVehicleOwner = user.role === "VEHICLE_OWNER";

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <aside className="self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-24">
        <div className="px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Kênh đối tác</p>
          <h1 className="mt-1 text-base font-bold text-slate-950">{isVehicleOwner ? "Quản lý phương tiện" : "Quản lý chỗ nghỉ"}</h1>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Điều hướng đối tác">
          {tabs.map(([to, label, number, end]) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? "bg-emerald-50 text-emerald-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600" aria-hidden="true">{number}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="min-w-0"><Outlet /></section>
    </div>
  );
}