import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { vnd } from "../../utils/index.js";
import { Badge, btn, btnGhost, ErrBox, SLOT } from "../../components/domain/HostUi.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";

export default function HostOrders() {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState("PENDING");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);
  const [rejectItem, setRejectItem] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => api("/host/inbox/").then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function decide(item, action, rejectReason = "") {
    setBusy(item.item_id); setErr("");
    try {
      await api(`/host/items/${item.item_id}/decision/`, { method: "POST", body: { action, reason: rejectReason } });
      await load();
      return true;
    } catch (e) {
      setErr(e.message);
      await load();
      return false;
    }
    finally { setBusy(null); }
  }

  if (!list) return err ? <ErrBox msg={err} /> : <div className="text-slate-500">Đang tải đơn đặt…</div>;
  const shown = tab === "PENDING" ? list.filter((i) => i.status === "PENDING") : list;
  const pendingCount = list.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-800">QUẢN LÝ ĐƠN</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Đơn đặt cần xử lý</h1>
        <p className="mt-2 text-sm text-slate-600">Xem thông tin khách và xác nhận yêu cầu đặt chỗ.</p>
      </div>
      <div className="flex gap-2">
        <button className={tab === "PENDING" ? btn : btnGhost} onClick={() => setTab("PENDING")}>Chờ xác nhận ({pendingCount})</button>
        <button className={tab === "ALL" ? btn : btnGhost} onClick={() => setTab("ALL")}>Tất cả</button>
      </div>
      <ErrBox msg={err} />
      {shown.length === 0 && <Card className="p-8 text-center text-sm text-slate-600">Không có đơn nào trong mục này.</Card>}
      {shown.map((i) => (
        <Card key={i.item_id} className="p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="font-bold text-slate-950">{i.resource}</div>
              <div className="mt-1 text-sm text-slate-600">{i.check_in} → {i.check_out} · {i.guests} khách</div>
              <div className="mt-2 text-sm text-slate-600">Khách: <b>{i.customer}</b>{i.phone && ` · ${i.phone}`} · {i.email}</div>
              <div className="mt-1 text-xs text-slate-500">Mã đơn {i.booking}</div>
            </div>
            <div className="sm:text-right">
              <Badge map={SLOT} k={i.status} />
              <div className="mt-2 font-bold text-slate-950">{vnd(i.subtotal)}</div>
            </div>
          </div>
          {i.status === "CANCELLED" && i.note && <div className="text-xs text-slate-500 mt-2">Lý do: {i.note}</div>}
          {i.status === "PENDING" && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button disabled={busy === i.item_id} className={btn} onClick={() => decide(i, "confirm")}>Xác nhận đặt chỗ</button>
              <button disabled={busy === i.item_id} className={btnGhost} onClick={() => { setRejectItem(i); setReason(""); }}>Từ chối</button>
            </div>
          )}
        </Card>
      ))}
      <Modal open={Boolean(rejectItem)} title="Từ chối yêu cầu đặt chỗ" labelledBy="host-reject-title" onClose={() => setRejectItem(null)}>
        <p className="text-sm leading-6 text-slate-600">Nhập lý do để khách hiểu vì sao yêu cầu không thể được xác nhận.</p>
        <label htmlFor="host-reject-reason" className="mt-4 block text-sm font-semibold text-slate-700">Lý do từ chối</label>
        <textarea id="host-reject-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectItem(null)}>Quay lại</Button>
          <Button variant="danger" disabled={!reason.trim() || busy === rejectItem?.item_id} onClick={async () => {
            if (await decide(rejectItem, "reject", reason.trim())) setRejectItem(null);
          }}>Xác nhận từ chối</Button>
        </div>
      </Modal>
    </div>
  );
}