import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { vnd } from "../../utils/index.js";
import { APPROVAL, Badge, btn, ErrBox, inp } from "../../components/domain/HostUi.jsx";

function useCrud(paths) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { setData(await Promise.all(paths.map((p) => api(p)))); } catch (e) { setErr(e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setErr(""); try { await fn(); await load(); return true; } catch (e) { setErr(e.message); return false; } };
  return { data, err, run };
}

function RoomForm({ homestayId, onAdd }) {
  const [f, setF] = useState({ name: "", base_price: "", max_guests: 2 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end mt-3"
          onSubmit={async (e) => { e.preventDefault(); if (await onAdd({ ...f, homestay: homestayId })) setF({ name: "", base_price: "", max_guests: 2 }); }}>
      <label className="text-sm">Tên phòng<input required value={f.name} onChange={set("name")} className={inp} /></label>
      <label className="text-sm">Giá gốc/đêm (₫)<input required type="number" min="1000" step="1000" value={f.base_price} onChange={set("base_price")} className={inp} /></label>
      <label className="text-sm">Số khách tối đa<input required type="number" min="1" value={f.max_guests} onChange={set("max_guests")} className={inp} /></label>
      <button className={btn}>+ Thêm phòng</button>
    </form>
  );
}

function Homestays() {
  const { data, err, run } = useCrud(["/host/homestays/", "/host/rooms/"]);
  const [open, setOpen] = useState(false);
  const empty = { name: "", address: "", city: "", description: "", latitude: "", longitude: "" };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!data) return <div className="text-slate-500">{err || "Đang tải…"}</div>;
  const [homestays, rooms] = data;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">Homestay của tôi</h1>
        <button className={btn} onClick={() => setOpen(!open)}>{open ? "Đóng" : "+ Đăng homestay mới"}</button>
      </div>
      <ErrBox msg={err} />

      {open && (
        <form className="bg-white border rounded-xl p-4 grid md:grid-cols-2 gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const body = { ...f, latitude: f.latitude || null, longitude: f.longitude || null };
                if (await run(() => api("/host/homestays/", { method: "POST", body }))) { setF(empty); setOpen(false); }
              }}>
          <label className="text-sm">Tên homestay<input required value={f.name} onChange={set("name")} className={inp} /></label>
          <label className="text-sm">Thành phố<input required value={f.city} onChange={set("city")} className={inp} /></label>
          <label className="text-sm md:col-span-2">Địa chỉ<input required value={f.address} onChange={set("address")} className={inp} /></label>
          <label className="text-sm">Vĩ độ (lat)<input value={f.latitude} onChange={set("latitude")} placeholder="11.9404" className={inp} /></label>
          <label className="text-sm">Kinh độ (lng)<input value={f.longitude} onChange={set("longitude")} placeholder="108.4583" className={inp} /></label>
          <label className="text-sm md:col-span-2">Mô tả<textarea rows={3} value={f.description} onChange={set("description")} className={inp} /></label>
          <div className="md:col-span-2 flex items-center gap-3">
            <button className={btn}>Gửi duyệt</button>
            <span className="text-xs text-slate-500">Tin mới ở trạng thái "Chờ admin duyệt" và chưa hiển thị công khai. Tọa độ cần có để hiện trên bản đồ (Google Maps: chuột phải vào vị trí → sao chép tọa độ).</span>
          </div>
        </form>
      )}

      {homestays.length === 0 && <div className="text-slate-500">Bạn chưa có homestay nào.</div>}
      {homestays.map((h) => (
        <div key={h.id} className="bg-white border rounded-xl p-4">
          <div className="flex justify-between gap-3">
            <div>
              <div className="font-semibold">{h.name}</div>
              <div className="text-sm text-slate-500">{h.address}, {h.city}</div>
              {h.status === "REJECTED" && h.reject_reason && <div className="text-sm text-red-600 mt-1">Lý do: {h.reject_reason}</div>}
            </div>
            <div className="flex items-start gap-2">
              <Badge map={APPROVAL} k={h.status} />
              <button className="text-sm text-red-600 hover:underline"
                      onClick={() => confirm(`Xóa homestay "${h.name}"?`) && run(() => api(`/host/homestays/${h.id}/`, { method: "DELETE" }))}>Xóa</button>
            </div>
          </div>
          <div className="mt-3 divide-y border rounded-lg">
            {rooms.filter((r) => r.homestay === h.id).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <b>{r.name}</b> · {vnd(r.base_price)}/đêm · tối đa {r.max_guests} khách
                  {!r.is_active && <span className="ml-2 text-xs text-slate-500">(đang tắt)</span>}
                </div>
                <div className="flex gap-3">
                  <button className="text-emerald-700 hover:underline"
                          onClick={() => run(() => api(`/host/rooms/${r.id}/`, { method: "PATCH", body: { is_active: !r.is_active } }))}>
                    {r.is_active ? "Tắt" : "Bật"}
                  </button>
                  <button className="text-red-600 hover:underline"
                          onClick={() => confirm(`Xóa phòng "${r.name}"?`) && run(() => api(`/host/rooms/${r.id}/`, { method: "DELETE" }))}>Xóa</button>
                </div>
              </div>
            ))}
            {rooms.filter((r) => r.homestay === h.id).length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Chưa có phòng.</div>}
          </div>
          <RoomForm homestayId={h.id} onAdd={(body) => run(() => api("/host/rooms/", { method: "POST", body }))} />
        </div>
      ))}
    </div>
  );
}

function Vehicles() {
  const { data, err, run } = useCrud(["/host/vehicles/"]);
  const empty = { name: "", vehicle_type: "MOTORBIKE", transmission: "AT", engine_cc: "", seats: 2, base_price: "", city: "" };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!data) return <div className="text-slate-500">{err || "Đang tải…"}</div>;
  const [vehicles] = data;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Xe của tôi</h1>
      <ErrBox msg={err} />
      <form className="bg-white border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("/host/vehicles/", { method: "POST", body: { ...f, engine_cc: f.engine_cc || null } }))) setF(empty);
            }}>
        <label className="text-sm col-span-2">Tên xe<input required value={f.name} onChange={set("name")} className={inp} /></label>
        <label className="text-sm">Loại
          <select value={f.vehicle_type} onChange={set("vehicle_type")} className={inp}><option value="MOTORBIKE">Xe máy</option><option value="CAR">Ô tô</option></select>
        </label>
        <label className="text-sm">Hộp số
          <select value={f.transmission} onChange={set("transmission")} className={inp}><option value="AT">Số tự động</option><option value="MT">Số sàn</option></select>
        </label>
        <label className="text-sm">Phân khối (cc)<input type="number" value={f.engine_cc} onChange={set("engine_cc")} className={inp} /></label>
        <label className="text-sm">Số chỗ<input required type="number" min="1" value={f.seats} onChange={set("seats")} className={inp} /></label>
        <label className="text-sm">Giá/ngày (₫)<input required type="number" min="1000" step="1000" value={f.base_price} onChange={set("base_price")} className={inp} /></label>
        <label className="text-sm">Thành phố<input required value={f.city} onChange={set("city")} className={inp} /></label>
        <button className={btn + " col-span-2 md:col-span-4"}>+ Đăng xe (chờ admin duyệt)</button>
      </form>

      <div className="bg-white border rounded-xl divide-y">
        {vehicles.length === 0 && <div className="p-4 text-sm text-slate-500">Chưa có xe nào.</div>}
        {vehicles.map((v) => (
          <div key={v.id} className="flex flex-col justify-between gap-3 p-4 text-sm sm:flex-row sm:items-center">
            <div className="min-w-0">
              <b>{v.name}</b> · {v.vehicle_type === "CAR" ? "Ô tô" : "Xe máy"} · {v.transmission === "AT" ? "Số tự động" : "Số sàn"} · {v.seats} chỗ · {vnd(v.base_price)}/ngày · {v.city}
              {v.status === "REJECTED" && v.reject_reason && <p className="mt-1 text-sm text-rose-700">Lý do từ chối: {v.reject_reason}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge map={APPROVAL} k={v.status} />
              <button className="text-red-600 hover:underline"
                      onClick={() => confirm(`Xóa xe "${v.name}"?`) && run(() => api(`/host/vehicles/${v.id}/`, { method: "DELETE" }))}>Xóa</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HostListings() {
  const { user } = useAuth();
  return user.role === "VEHICLE_OWNER" ? <Vehicles /> : <Homestays />;
}