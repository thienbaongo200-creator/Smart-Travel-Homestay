import { useEffect, useState } from "react";
import { api } from "../../api";
import { vnd } from "../../utils";
import { ErrBox, SLOT } from "./ui.jsx";

const Card = ({ label, value, hint }) => (
  <div className="bg-white border rounded-xl p-4">
    <div className="text-sm text-slate-500">{label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
    {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
  </div>
);

export default function HostDashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/host/stats/").then(setS).catch((e) => setErr(e.message)); }, []);
  if (!s) return <div className="text-slate-500">{err || "Đang tải…"}</div>;

  const max = Math.max(1, ...s.monthly.map((m) => Number(m.revenue)));
  return (
    <div className="space-y-4">
      <ErrBox msg={err} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Doanh thu (đơn đã xác nhận)" value={vnd(s.total_revenue)} />
        <Card label="Đơn đã xác nhận" value={s.total_orders} />
        <Card label="Đang chờ bạn xác nhận" value={s.pending} hint={s.pending ? "Vào tab Đơn đặt để xử lý" : ""} />
        <Card label="Lấp đầy 30 ngày tới" value={s.occupancy_30d == null ? "—" : `${s.occupancy_30d}%`} hint="Theo số đêm phòng" />
      </div>

      <div className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Doanh thu theo tháng (theo ngày nhận phòng)</h2>
        {s.monthly.length === 0 ? <div className="text-sm text-slate-500">Chưa có đơn nào được xác nhận.</div> : (
          <div className="flex items-end gap-3 h-48">
            {s.monthly.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full min-w-[48px]">
                <div className="text-xs text-slate-500 mb-1">{Math.round(Number(m.revenue) / 1000)}k</div>
                <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${(Number(m.revenue) / max) * 100}%`, minHeight: 4 }} />
                <div className="text-xs mt-1">{m.month.slice(5)}/{m.month.slice(2, 4)}</div>
                <div className="text-[11px] text-slate-400">{m.orders} đơn</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Đơn theo trạng thái</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(s.by_status).map(([k, n]) => (
            <span key={k} className="px-2 py-1 rounded bg-slate-100">{(SLOT[k] ?? [k])[0]}: <b>{n}</b></span>
          ))}
          {Object.keys(s.by_status).length === 0 && <span className="text-slate-500">Chưa có đơn.</span>}
        </div>
      </div>
    </div>
  );
}