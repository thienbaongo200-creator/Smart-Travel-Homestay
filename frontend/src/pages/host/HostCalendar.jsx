import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth.jsx";
import Calendar from "../../components/Calendar.jsx";
import { addDays } from "../../utils";
import { Badge, btn, ErrBox, inp, SLOT } from "./ui.jsx";

export default function HostCalendar() {
  const { user } = useAuth();
  const isVehicle = user.role === "VEHICLE_OWNER";
  const base = isVehicle ? "/host/vehicles" : "/host/rooms";

  const [items, setItems] = useState([]);
  const [sel, setSel] = useState("");
  const [slots, setSlots] = useState([]);
  const [range, setRange] = useState({ checkIn: "", checkOut: "" });
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`${base}/`).then((l) => { setItems(l); if (l[0]) setSel(String(l[0].id)); }).catch((e) => setErr(e.message));
  }, [base]);

  const loadSlots = useCallback(async () => {
    if (!sel) { setSlots([]); return; }
    try { setSlots(await api(`${base}/${sel}/calendar/`)); } catch (e) { setErr(e.message); }
  }, [base, sel]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const busy = useMemo(() => {
    const s = new Set();
    for (const x of slots) for (let d = x.from; d < x.to; d = addDays(d, 1)) s.add(d);
    return s;
  }, [slots]);

  async function block() {
    setErr("");
    try {
      await api(`${base}/${sel}/blocks/`, { method: "POST", body: { check_in: range.checkIn, check_out: range.checkOut, note } });
      setRange({ checkIn: "", checkOut: "" }); setNote(""); await loadSlots();
    } catch (e) { setErr(e.message); }
  }
  async function unblock(id) {
    setErr("");
    try { await api(`/host/blocks/${id}/`, { method: "DELETE" }); await loadSlots(); } catch (e) { setErr(e.message); }
  }

  if (items.length === 0) return <div className="text-slate-500">{err || (isVehicle ? "Bạn chưa có xe nào." : "Bạn chưa có phòng nào.")}</div>;
  const canBlock = !isVehicle && range.checkIn && range.checkOut;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-3">
        <label className="block text-sm">{isVehicle ? "Chọn xe" : "Chọn phòng"}
          <select value={sel} onChange={(e) => { setSel(e.target.value); setRange({ checkIn: "", checkOut: "" }); }} className={inp}>
            {items.map((i) => <option key={i.id} value={i.id}>{isVehicle ? i.name : `${i.homestay_name} / ${i.name}`}</option>)}
          </select>
        </label>
        <Calendar busy={busy} checkIn={isVehicle ? "" : range.checkIn} checkOut={isVehicle ? "" : range.checkOut} onChange={isVehicle ? () => {} : setRange} />
        {isVehicle ? (
          <div className="text-sm text-slate-500">Lịch xe chỉ xem; thay đổi thông qua đơn đặt (quy định nghiệp vụ).</div>
        ) : (
          <div className="bg-white border rounded-xl p-4 space-y-2">
            <div className="text-sm font-medium">Chặn lịch thủ công (bảo trì / không cho thuê)</div>
            <div className="text-sm text-slate-600">{canBlock ? `${range.checkIn} → ${range.checkOut}` : "Chọn khoảng ngày trên lịch."}</div>
            <input placeholder="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} className={inp} />
            <button disabled={!canBlock} onClick={block} className={btn}>Chặn khoảng ngày này</button>
          </div>
        )}
        <ErrBox msg={err} />
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Lịch sắp tới</h2>
        {slots.length === 0 && <div className="text-sm text-slate-500">Chưa có đơn hay khóa nào.</div>}
        <div className="divide-y">
          {slots.map((s) => (
            <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div>
                <div>{s.from} → {s.to}</div>
                <div className="text-xs text-slate-500">{s.booking ? `Đơn #${s.booking}` : s.note || "Khóa thủ công"}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge map={SLOT} k={s.status} />
                {s.status === "BLOCKED" && !isVehicle && (
                  <button className="text-emerald-700 hover:underline" onClick={() => unblock(s.id)}>Mở lại</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}