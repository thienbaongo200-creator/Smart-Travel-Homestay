import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import Calendar from "../../components/domain/Calendar.jsx";
import QuoteTable from "../../components/domain/QuoteTable.jsx";
import { daysBetween, dayLabel, vnd } from "../../utils/index.js";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";

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

  if (!room) return err ? <Alert>{err}</Alert> : <LoadingState label="Đang tải thông tin chỗ nghỉ…" />;
  const vehicleName = vehicles.find((v) => v.vehicle_id === vehicleId)?.name;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
      <section className="space-y-5">
        <Card className="p-5 sm:p-7">
          <p className="text-sm font-semibold text-emerald-800">{room.city}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{room.homestay}</h1>
          <div className="mt-2 text-sm text-slate-600">{room.name} · {room.address}, {room.city}</div>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-700">{room.description || "Chưa có mô tả cho chỗ nghỉ này."}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">Tối đa {room.max_guests} khách</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">{vnd(room.base_price)} / đêm</span>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="mb-1 text-lg font-bold text-slate-950">Chọn ngày lưu trú</h2>
          <p className="mb-4 text-sm text-slate-600">Ngày đã kín được đánh dấu trên lịch và không thể chọn.</p>
          <Calendar busy={busy} checkIn={range.checkIn} checkOut={range.checkOut} onChange={setRange} />
          <div className="mt-3 text-sm font-medium text-slate-700">
            {valid
              ? `${dayLabel(range.checkIn)} → ${dayLabel(range.checkOut)} (${daysBetween(range.checkIn, range.checkOut)} đêm)`
              : "Chọn ngày nhận phòng, sau đó chọn ngày trả phòng."}
          </div>
        </Card>

        {valid && (
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-950">Thêm phương tiện (không bắt buộc)</h2>
            <p className="mt-1 text-sm text-slate-600">Chỉ hiển thị xe còn trống trong toàn bộ kỳ lưu trú.</p>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
              <input type="radio" name="vehicle" checked={vehicleId === null} onChange={() => setVehicleId(null)} className="h-4 w-4 accent-emerald-800" /> Không thuê xe
            </label>
            {vehicles.map((v) => (
              <label key={v.vehicle_id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
                <input type="radio" name="vehicle" checked={vehicleId === v.vehicle_id} onChange={() => setVehicleId(v.vehicle_id)} className="h-4 w-4 accent-emerald-800" />
                <span><b className="text-slate-900">{v.name}</b><span className="block text-xs text-slate-600">{v.type === "CAR" ? "Ô tô" : "Xe máy"} · {v.seats} chỗ · {vnd(v.base_price)}/ngày</span></span>
              </label>
            ))}
            {vehicles.length === 0 && <div className="mt-3 text-sm text-slate-500">Không có xe trống trong kỳ này.</div>}
          </Card>
        )}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <Card className="p-4">
          <label className="block text-sm font-semibold text-slate-700">Số khách
            <input type="number" min="1" max={room.max_guests} value={guests}
                   onChange={(e) => setGuests(Number(e.target.value))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
          </label>
        </Card>
        {quote ? <QuoteTable quote={quote} vehicleName={vehicleName} /> : (
          <Card className="p-5 text-sm leading-6 text-slate-600">Chọn ngày để xem bảng giá chi tiết theo từng đêm.</Card>
        )}
        <Alert>{err}</Alert>
        <Button disabled={!quote || busyBooking} onClick={book} className="w-full">
          {busyBooking ? "Đang giữ chỗ…" : user ? "Giữ chỗ & đặt cọc" : "Đăng nhập để đặt"}
        </Button>
        <p className="text-center text-xs leading-5 text-slate-500">Chỗ được giữ tạm trong 15 phút để bạn hoàn tất đặt cọc.</p>
      </aside>
    </div>
  );
}
