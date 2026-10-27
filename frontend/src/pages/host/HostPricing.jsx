import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { btn, ErrBox, inp } from "../../components/domain/HostUi.jsx";

const KINDS = {
  WEEKEND: "Cuối tuần (T6–CN)", HOLIDAY: "Ngày lễ/Tết", SEASON: "Mùa cao/thấp điểm",
  OCCUPANCY: "Công suất lấp đầy", LEAD_TIME: "Đặt trước/sát ngày", COMBO: "Combo phòng + xe",
};
const summary = (r) => {
  switch (r.kind) {
    case "HOLIDAY": case "SEASON": return `${r.start_date} → ${r.end_date}`;
    case "OCCUPANCY": return `≥ ${r.min_value}% lấp đầy`;
    case "LEAD_TIME": return `${r.min_value ?? 0} – ${r.max_value ?? "∞"} ngày trước ngày nhận`;
    case "COMBO": return `thuê từ ${r.min_value} đêm`;
    default: return "Thứ 6, Thứ 7, Chủ nhật";
  }
};
const HINT = {
  WEEKEND: "Hệ số ≥ 1.0 (VD 1.2 = +20%).", HOLIDAY: "Hệ số ≥ 1.0. Nếu trùng cuối tuần, lấy hệ số cao hơn.",
  SEASON: "Có thể < 1 cho mùa thấp điểm (VD 0.85).", OCCUPANCY: "Ngưỡng % (VD 70 → ×1.1, 80 → ×1.2).",
  LEAD_TIME: "VD đặt ≥30 ngày: 0.95; 0–1 ngày: 1.10.", COMBO: "VD 0.9 = giảm 10% tiền xe nếu thuê từ N đêm.",
};

export default function HostPricing() {
  const { user } = useAuth();
  const isVehicle = user.role === "VEHICLE_OWNER";
  const scope = isVehicle ? "vehicle" : "homestay";
  const kinds = Object.keys(KINDS).filter((k) => (isVehicle ? true : k !== "COMBO"));

  const [res, setRes] = useState([]);
  const [sel, setSel] = useState("");
  const [rules, setRules] = useState([]);
  const [err, setErr] = useState("");
  const empty = { kind: kinds[0], multiplier: "1.2", start_date: "", end_date: "", min_value: "", max_value: "", label: "" };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api(isVehicle ? "/host/vehicles/" : "/host/homestays/").then((l) => { setRes(l); if (l[0]) setSel(String(l[0].id)); }).catch((e) => setErr(e.message));
  }, [isVehicle]);

  const load = useCallback(async () => {
    try { setRules(await api("/host/pricing-rules/")); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mine = rules.filter((r) => String(r[scope]) === sel);
  const num = (v) => (v === "" ? null : Number(v));

  async function add(e) {
    e.preventDefault(); setErr("");
    const body = {
      [scope]: Number(sel), target: isVehicle ? "VEHICLE" : "ROOM", kind: f.kind, multiplier: f.multiplier,
      start_date: f.start_date || null, end_date: f.end_date || null,
      min_value: num(f.min_value), max_value: num(f.max_value), label: f.label,
    };
    try { await api("/host/pricing-rules/", { method: "POST", body }); setF(empty); await load(); } catch (e2) { setErr(e2.message); }
  }
  async function patch(id, body) { setErr(""); try { await api(`/host/pricing-rules/${id}/`, { method: "PATCH", body }); await load(); } catch (e) { setErr(e.message); } }
  async function del(id) { setErr(""); try { await api(`/host/pricing-rules/${id}/`, { method: "DELETE" }); await load(); } catch (e) { setErr(e.message); } }

  if (res.length === 0) return <div className="text-slate-500">{err || (isVehicle ? "Hãy đăng xe trước." : "Hãy đăng homestay trước.")}</div>;
  const needDates = f.kind === "HOLIDAY" || f.kind === "SEASON";
  const needMin = ["OCCUPANCY", "LEAD_TIME", "COMBO"].includes(f.kind);

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3 space-y-3">
        <label className="block text-sm">{isVehicle ? "Xe" : "Homestay"}
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inp}>
            {res.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <ErrBox msg={err} />
        <div className="bg-white border rounded-xl divide-y">
          {mine.length === 0 && <div className="p-4 text-sm text-slate-500">Chưa có quy tắc riêng. Hệ thống sẽ dùng quy tắc mặc định (nếu có).</div>}
          {mine.map((r) => (
            <div key={r.id} className={`p-3 flex items-center justify-between gap-3 text-sm ${r.is_active ? "" : "opacity-50"}`}>
              <div>
                <div className="font-medium">{KINDS[r.kind]} <span className="text-emerald-700">×{Number(r.multiplier)}</span>{r.label && <span className="text-slate-500 font-normal"> · {r.label}</span>}</div>
                <div className="text-xs text-slate-500">{summary(r)}</div>
              </div>
              <div className="flex gap-3 whitespace-nowrap">
                <button className="text-emerald-700 hover:underline" onClick={() => patch(r.id, { is_active: !r.is_active })}>{r.is_active ? "Tắt" : "Bật"}</button>
                <button className="text-red-600 hover:underline" onClick={() => confirm("Xóa quy tắc này?") && del(r.id)}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={add} className="lg:col-span-2 bg-white border rounded-xl p-4 space-y-3 self-start">
        <h2 className="font-semibold">Thêm quy tắc giá</h2>
        <label className="block text-sm">Loại
          <select value={f.kind} onChange={set("kind")} className={inp}>{kinds.map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}</select>
        </label>
        <label className="block text-sm">Hệ số
          <input required type="number" step="0.01" min="0.1" value={f.multiplier} onChange={set("multiplier")} className={inp} />
        </label>
        <div className="text-xs text-slate-500">{HINT[f.kind]}</div>
        {needDates && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Từ ngày<input required type="date" value={f.start_date} onChange={set("start_date")} className={inp} /></label>
            <label className="text-sm">Đến ngày<input required type="date" value={f.end_date} onChange={set("end_date")} className={inp} /></label>
          </div>
        )}
        {needMin && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">{f.kind === "OCCUPANCY" ? "Từ % lấp đầy" : f.kind === "COMBO" ? "Từ số đêm" : "Từ (ngày trước)"}
              <input required type="number" min="0" value={f.min_value} onChange={set("min_value")} className={inp} />
            </label>
            {f.kind === "LEAD_TIME" && <label className="text-sm">Đến (ngày trước)<input type="number" min="0" value={f.max_value} onChange={set("max_value")} className={inp} /></label>}
          </div>
        )}
        <label className="block text-sm">Nhãn (tùy chọn)<input value={f.label} onChange={set("label")} className={inp} /></label>
        <button className={btn + " w-full"}>Lưu quy tắc</button>
      </form>
    </div>
  );
}