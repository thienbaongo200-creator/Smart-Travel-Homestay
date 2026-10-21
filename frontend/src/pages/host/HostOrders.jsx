import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { vnd } from "../../utils";
import { Badge, btn, btnGhost, ErrBox, SLOT } from "./ui.jsx";

export default function HostOrders() {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState("PENDING");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => api("/host/inbox/").then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function decide(item, action) {
    let reason = "";
    if (action === "reject") { reason = prompt("Lý do từ chối (khách sẽ thấy):") ?? null; if (reason === null) return; }
    setBusy(item.item_id); setErr("");
    try { await api(`/host/items/${item.item_id}/decision/`, { method: "POST", body: { action, reason } }); await load(); }
    catch (e) { setErr(e.message); await load(); }
    finally { setBusy(null); }
  }

  if (!list) return <div className="text-slate-500">{err || "Đang tải…"}</div>;
  const shown = tab === "PENDING" ? list.filter((i) => i.status === "PENDING") : list;
  const pendingCount = list.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button className={tab === "PENDING" ? btn : btnGhost} onClick={() => setTab("PENDING")}>Chờ xác nhận ({pendingCount})</button>
        <button className={tab === "ALL" ? btn : btnGhost} onClick={() => setTab("ALL")}>Tất cả</button>
      </div>
      <ErrBox msg={err} />
      {shown.length === 0 && <div className="text-slate-500">Không có đơn nào.</div>}
      {shown.map((i) => (
        <div key={i.item_id} className="bg-white border rounded-xl p-4">
          <div className="flex justify-between gap-3">
            <div>
              <div className="font-semibold">{i.resource} <span className="text-xs font-mono text-slate-400">#{i.booking}</span></div>
              <div className="text-sm text-slate-600">{i.check_in} → {i.check_out} · {i.guests} khách</div>
              <div className="text-sm text-slate-500">Khách: {i.customer}{i.phone && ` · ${i.phone}`} · {i.email}</div>
            </div>
            <div className="text-right">
              <Badge map={SLOT} k={i.status} />
              <div className="font-bold mt-2">{vnd(i.subtotal)}</div>
            </div>
          </div>
          {i.status === "CANCELLED" && i.note && <div className="text-xs text-slate-500 mt-2">Lý do: {i.note}</div>}
          {i.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <button disabled={busy === i.item_id} className={btn} onClick={() => decide(i, "confirm")}>Xác nhận</button>
              <button disabled={busy === i.item_id} className={btnGhost} onClick={() => decide(i, "reject")}>Từ chối</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}