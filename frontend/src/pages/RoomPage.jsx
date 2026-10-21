import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import Calendar from "../components/Calendar.jsx";
import QuoteTable from "../components/QuoteTable.jsx";
import { daysBetween, dayLabel, vnd } from "../utils";

export default function RoomPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();

  const [room, setRoom] = useState(null);
  const [range, setRange] = useState({ checkIn: sp.get("check_in") || "", checkOut: sp.get("check_out") || "" });
  const [guests, setGuests] = useState(Number(sp.get("guests") || 2));
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState(null);
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState("");
  const [busyBooking, setBusyBooking] = useState(false);

  const busy = useMemo(() => new Set(room?.busy_dates ?? []), [room]);
  const valid = range.checkIn && range.checkOut && range.checkIn < range.checkOut;

  useEffect(() => {
    api(`/rooms/${id}/`, { auth: false }).then(setRoom).catch((e) => setErr(e.message));
  }, [id]);

  // Xe gợi ý: chỉ xe trống trong toàn bộ kỳ lưu trú
  useEffect(() => {
    if (!valid || !room) return;
    let off = false;
    const q = new URLSearchParams({ city: room.city, check_in: range.checkIn, check_out: range.checkOut, guests: guests });
    api(`/vehicles/suggest/?${q}`, { auth: false }).then((v) => {
      if (off) return;
      setVehicles(v);
      setVehicleId((cur) => (v.some((x) => x.vehicle_id === cur) ? cur : null));
    }).catch(() => setVehicles([]));
    return () => { off = true; };
  }, [valid, room, range.checkIn, range.checkOut, guests]);

  // Báo giá chi tiết từng ngày
  useEffect(() => {
    if (!valid) { setQuote(null); return; }
    let off = false;
    api("/quote/", { method: "POST", auth: false, body: {
      room_id: Number(id), vehicle_id: vehicleId, check_in: range.checkIn, check_out: range.checkOut, guests,
    } }).then((q) => { if (!off) { setQuote(q); setErr(""); } }).catch((e) => { if (!off) { setQuote(null); setErr(e.message); } });
    return () => { off = true; };
  }, [valid, id, vehicleId, range.checkIn, range.checkOut, guests]);

  async function book() {
    if (!user) { nav("/login", { state: { from: loc.pathname + loc.search } }); return; }
    setBusyBooking(true); setErr("");
    try {
      const b = await api("/bookings/", { method: "POST", body: {
        room_id: Number(id), vehicle_id: vehicleId, check_in: range.checkIn, check_out: range.checkOut, guests,
      } });
      nav(`/bookings?new=${b.code}`);
    } catch (e) { setErr(e.message); }
    finally { setBusyBooking(false); }
  }

  if (!room) return <div className="text-slate-500">{err || "Đang tải…"}</div>;
  const vehicleName = vehicles.find((v) => v.vehicle_id === vehicleId)?.name;

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <section className="lg:col-span-3 space-y-4">
        <div className="bg-white border rounded-xl p-5">
          <h1 className="text-2xl font-bold">{room.homestay}</h1>
          <div className="text-slate-500">{room.name} · {room.address}, {room.city}</div>
          <p className="mt-3 text-sm">{room.description || "Chưa có mô tả."}</p>
          <div className="mt-3 text-sm text-slate-600">Tối đa {room.max_guests} khách · Giá gốc {vnd(room.base_price)}/đêm</div>
        </div>

        <div>
          <h2 className="font-semibold mb-2">Chọn ngày (ngày đỏ là đã kín)</h2>
          <Calendar busy={busy} checkIn={range.checkIn} checkOut={range.checkOut} onChange={setRange} />
          <div className="text-sm text-slate-600 mt-2">
            {valid
              ? `${dayLabel(range.checkIn)} → ${dayLabel(range.checkOut)} (${daysBetween(range.checkIn, range.checkOut)} đêm)`
              : "Chọn ngày nhận phòng, sau đó chọn ngày trả phòng."}
          </div>
        </div>

        {valid && (
          <div className="bg-white border rounded-xl p-5">
            <h2 className="font-semibold mb-3">🛵 Thuê xe kèm (xe còn trống toàn bộ kỳ lưu trú)</h2>
            <label className="flex items-center gap-2 py-1 text-sm cursor-pointer">
              <input type="radio" checked={vehicleId === null} onChange={() => setVehicleId(null)} /> Không thuê xe
            </label>
            {vehicles.map((v) => (
              <label key={v.vehicle_id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <input type="radio" checked={vehicleId === v.vehicle_id} onChange={() => setVehicleId(v.vehicle_id)} />
                {v.name} · {v.type === "CAR" ? "Ô tô" : "Xe máy"} · {v.seats} chỗ · {vnd(v.base_price)}/ngày
              </label>
            ))}
            {vehicles.length === 0 && <div className="text-sm text-slate-500">Không có xe trống trong kỳ này.</div>}
          </div>
        )}
      </section>

      <aside className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 self-start">
        <label className="block text-sm bg-white border rounded-xl p-3">Số khách
          <input type="number" min="1" max={room.max_guests} value={guests}
                 onChange={(e) => setGuests(Number(e.target.value))} className="ml-3 w-20 border rounded-lg px-2 py-1" />
        </label>
        {quote ? <QuoteTable quote={quote} vehicleName={vehicleName} /> : (
          <div className="bg-white border rounded-xl p-5 text-sm text-slate-500">Chọn ngày để xem bảng giá chi tiết từng ngày.</div>
        )}
        {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
        <button disabled={!quote || busyBooking} onClick={book}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl py-3 font-semibold">
          {busyBooking ? "Đang giữ chỗ…" : user ? "Giữ chỗ & đặt cọc" : "Đăng nhập để đặt"}
        </button>
        <div className="text-xs text-slate-500">Lịch được giữ tạm 15 phút để bạn thanh toán cọc.</div>
      </aside>
    </div>
  );
}
