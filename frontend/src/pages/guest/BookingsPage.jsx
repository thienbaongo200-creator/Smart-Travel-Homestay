import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import Countdown from "../../components/domain/Countdown.jsx";
import { STATUS, vnd } from "../../utils";

export default function BookingsPage() {
  const [sp] = useSearchParams();
  const highlight = sp.get("new");
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState({}); // code -> chi tiết (giá từng đêm đã chốt)

  const load = useCallback(() => api("/bookings/").then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function pay(code, success) {
    setBusy(code); setErr("");
    try {
      await api(`/bookings/${code}/pay/`, { method: "POST" });
      await api(`/bookings/${code}/mock-pay/`, { method: "POST", body: { success } });
      await load();
    } catch (e) { setErr(e.message); await load(); }
    finally { setBusy(""); }
  }

  async function toggle(code) {
    if (detail[code]) { setDetail((d) => ({ ...d, [code]: null })); return; }
    try { const d = await api(`/bookings/${code}/`); setDetail((x) => ({ ...x, [code]: d })); }
    catch (e) { setErr(e.message); }
  }

  if (!list) return <div className="text-slate-500">{err || "Đang tải…"}</div>;
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-bold">Đơn của tôi</h1>
      {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
      {list.length === 0 && <div className="text-slate-500">Bạn chưa có đơn nào.</div>}
      {list.map((b) => {
        const [label, color] = STATUS[b.status] ?? [b.status, "bg-slate-200"];
        const d = detail[b.code];
        return (
          <div key={b.code} className={`bg-white border rounded-xl p-4 ${b.code === highlight ? "ring-2 ring-emerald-500" : ""}`}>
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-mono font-semibold">#{b.code}</div>
                <div className="text-sm text-slate-500">{b.check_in} → {b.check_out}</div>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>{label}</span>
            </div>
            <div className="mt-2 text-sm">Tổng {vnd(b.total)} · Cọc {vnd(b.deposit)}</div>
            <button className="mt-2 text-sm text-emerald-700 hover:underline" onClick={() => toggle(b.code)}>
              {d ? "Ẩn giá từng đêm" : "Xem giá từng đêm đã chốt"}
            </button>
            {d && d.items.map((it) => (
              <div key={it.name} className="mt-2 text-sm bg-slate-50 rounded-lg p-3">
                <div className="font-medium">{it.name} · {vnd(it.subtotal)}</div>
                {it.nights.map((n) => (
                  <div key={n.day} className="flex justify-between text-slate-600">
                    <span>{n.day} <span className="text-xs text-slate-400">{n.applied_rules}</span></span>
                    <span>{vnd(n.price)}</span>
                  </div>
                ))}
              </div>
            ))}
            {b.status === "HOLD" && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-amber-700">Giữ chỗ còn <Countdown until={b.hold_expires_at} onExpire={load} /></span>
                <button disabled={busy === b.code} onClick={() => pay(b.code, true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50">Thanh toán cọc (giả lập)</button>
                <button disabled={busy === b.code} onClick={() => pay(b.code, false)}
                        className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50">Giả lập thất bại</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}