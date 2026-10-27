import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api.js";
import MapView from "../../components/domain/MapView.jsx";
import { addDays, daysBetween, todayISO, vnd } from "../../utils/index.js";
import Card from "../../components/common/Card.jsx";
import Button from "../../components/common/Button.jsx";
import Alert from "../../components/common/Alert.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";

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
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">Chuyến đi bắt đầu từ đây</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Tìm một nơi để cảm thấy như ở nhà.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100 sm:text-base">So sánh chỗ nghỉ còn trống, lịch rõ ràng và giá minh bạch cho hành trình tiếp theo.</p>
      </section>

      <Card className="p-4 sm:p-5">
        <form onSubmit={(e) => { e.preventDefault(); search(form); }} className="grid grid-cols-2 gap-3 md:grid-cols-5 md:items-end">
        <label className="col-span-2 block text-sm font-semibold text-slate-700 md:col-span-1">Địa điểm
          <input value={form.city} onChange={set("city")} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Nhận phòng
          <input type="date" min={todayISO()} value={form.check_in} onChange={set("check_in")} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Trả phòng
          <input type="date" min={form.check_in} value={form.check_out} onChange={set("check_out")} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Số khách
          <input type="number" min="1" value={form.guests} onChange={set("guests")} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        </label>
        <Button type="submit" className="col-span-2 md:col-span-1">Tìm chỗ nghỉ</Button>
        </form>
      </Card>

      <Alert>{error}</Alert>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <section className="order-2 space-y-4 lg:order-1">
          {loading && <LoadingState label="Đang tìm chỗ nghỉ phù hợp…" />}
          {data && !loading && <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">Chỗ nghỉ phù hợp</h2><span className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-600">{rooms.length} lựa chọn · {daysBetween(form.check_in, form.check_out)} đêm</span></div>}
          {rooms.map((r) => (
            <Link
              key={r.room_id}
              to={`/rooms/${r.room_id}?${qs}`}
              onMouseEnter={() => setHover(r.room_id)} onMouseLeave={() => setHover(null)}
              className={`block rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${hover === r.room_id ? "border-emerald-600 ring-2 ring-emerald-700/20" : "border-slate-200"}`}
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-950">{r.homestay}</div>
                  <div className="mt-1 text-sm text-slate-600">{r.room} · {r.city}</div>
                  <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">Còn trống trong toàn bộ kỳ nghỉ</div>
                </div>
                <div className="sm:text-right">
                  <div className="text-xl font-bold text-emerald-900">{vnd(r.total)}</div>
                  <div className="text-sm text-slate-500">tổng cho {r.nights} đêm</div>
                  <div className="mt-2 text-sm font-semibold text-slate-700">Xem chi tiết <span aria-hidden="true">→</span></div>
                </div>
              </div>
            </Link>
          ))}
          {data && rooms.length === 0 && !loading && <EmptyState title="Chưa có chỗ nghỉ phù hợp" description="Hãy thử đổi ngày, địa điểm hoặc số lượng khách." />}
          {data?.vehicle_suggestions?.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="mb-3 font-bold text-slate-900">Phương tiện còn trống cùng kỳ</div>
              <div className="flex flex-wrap gap-2">
                {data.vehicle_suggestions.map((v) => (
                  <span key={v.vehicle_id} className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{v.name} · {vnd(v.base_price)}/ngày</span>
                ))}
              </div>
              <div className="mt-3 text-sm text-slate-600">Chọn phòng để thêm xe vào đơn. Có ưu đãi combo từ 3 đêm.</div>
            </Card>
          )}
        </section>
        <section className="order-1 h-[320px] lg:sticky lg:top-24 lg:order-2 lg:h-[calc(100vh-8rem)] lg:min-h-[520px]" aria-label="Bản đồ chỗ nghỉ">
          <MapView rooms={rooms} hoverId={hover} onHover={setHover} />
        </section>
      </div>
    </div>
  );
}
