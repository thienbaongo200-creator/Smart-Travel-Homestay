import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import MapView from "../components/MapView.jsx";
import { addDays, daysBetween, todayISO, vnd } from "../utils";

export default function SearchPage() {
  const [form, setForm] = useState({
    city: "Đà Lạt", check_in: addDays(todayISO(), 14), check_out: addDays(todayISO(), 16), guests: 2,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(null);

  const search = useCallback(async (f) => {
    if (f.check_in >= f.check_out) { setError("Ngày trả phòng phải sau ngày nhận phòng"); return; }
    setError(""); setLoading(true);
    try { setData(await api(`/search/?${new URLSearchParams(f)}`, { auth: false })); }
    catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { search(form); /* eslint-disable-next-line */ }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const qs = new URLSearchParams({ check_in: form.check_in, check_out: form.check_out, guests: form.guests });
  const rooms = data?.rooms ?? [];

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); search(form); }} className="bg-white border rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <label className="text-sm col-span-2 md:col-span-1">Địa điểm
          <input value={form.city} onChange={set("city")} className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm">Nhận phòng
          <input type="date" min={todayISO()} value={form.check_in} onChange={set("check_in")} className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm">Trả phòng
          <input type="date" min={form.check_in} value={form.check_out} onChange={set("check_out")} className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm">Số khách
          <input type="number" min="1" value={form.guests} onChange={set("guests")} className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 font-semibold">Tìm phòng</button>
      </form>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="space-y-3 order-2 lg:order-1">
          {loading && <div className="text-slate-500">Đang tìm…</div>}
          {data && !loading && <div className="text-sm text-slate-500">{rooms.length} phòng trống · {daysBetween(form.check_in, form.check_out)} đêm</div>}
          {rooms.map((r) => (
            <Link
              key={r.room_id}
              to={`/rooms/${r.room_id}?${qs}`}
              onMouseEnter={() => setHover(r.room_id)} onMouseLeave={() => setHover(null)}
              className={`block bg-white border rounded-xl p-4 hover:shadow ${hover === r.room_id ? "ring-2 ring-emerald-500" : ""}`}
            >
              <div className="flex justify-between gap-4">
                <div>
                  <div className="font-semibold">{r.homestay}</div>
                  <div className="text-sm text-slate-500">{r.room} · {r.city}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{vnd(r.total)}</div>
                  <div className="text-xs text-slate-500">cho {r.nights} đêm</div>
                </div>
              </div>
            </Link>
          ))}
          {data && rooms.length === 0 && !loading && <div className="text-slate-500">Không có phòng trống phù hợp.</div>}
          {data?.vehicle_suggestions?.length > 0 && (
            <div className="bg-white border rounded-xl p-4">
              <div className="font-semibold mb-2">🛵 Xe còn trống cùng kỳ</div>
              <div className="flex flex-wrap gap-2">
                {data.vehicle_suggestions.map((v) => (
                  <span key={v.vehicle_id} className="text-sm px-2 py-1 bg-slate-100 rounded-lg">{v.name} · {vnd(v.base_price)}/ngày</span>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">Chọn phòng để thêm xe vào đơn (giảm giá combo từ 3 đêm).</div>
            </div>
          )}
        </section>
        <section className="order-1 lg:order-2 h-[420px] lg:h-[calc(100vh-14rem)] lg:sticky lg:top-4">
          <MapView rooms={rooms} hoverId={hover} onHover={setHover} />
        </section>
      </div>
    </div>
  );
}
