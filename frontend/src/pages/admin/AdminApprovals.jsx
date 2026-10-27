import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api.js";
import Alert from "../../components/common/Alert.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import Input from "../../components/common/Input.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";
import Modal from "../../components/common/Modal.jsx";
import { vnd } from "../../utils/index.js";

function ApprovalCard({ item, kind, busy, onDecision }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const vehicle = kind === "vehicle";

  async function reject() {
    if (!reason.trim()) return;
    const saved = await onDecision(kind, item.id, "REJECTED", reason.trim());
    if (saved) {
      setRejecting(false);
      setReason("");
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone={vehicle ? "info" : "success"}>{vehicle ? "Phương tiện" : "Homestay"}</Badge>
          <h2 className="mt-3 text-lg font-bold text-slate-950">{item.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{vehicle ? `${item.vehicle_type} · ${item.city}` : `${item.address}, ${item.city}`}</p>
        </div>
        <Badge tone="warning">Chờ duyệt</Badge>
      </div>
      <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
        <p><span className="text-slate-500">Chủ đăng:</span> <span className="font-semibold text-slate-800">{item.owner}</span></p>
        {vehicle && <p><span className="text-slate-500">Giá/ngày:</span> <span className="font-semibold text-slate-800">{vnd(item.base_price)}</span></p>}
        {!vehicle && item.description && <p className="leading-6 text-slate-600 sm:col-span-2">{item.description}</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onDecision(kind, item.id, "APPROVED")}>{busy ? "Đang xử lý…" : "Phê duyệt"}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>Từ chối</Button>
      </div>
      <Modal open={rejecting} title="Từ chối tin đăng" onClose={() => setRejecting(false)} labelledBy={`reject-title-${kind}-${item.id}`}>
        <p className="mb-4 text-sm leading-6 text-slate-600">Cho chủ đăng biết lý do để họ có thể chỉnh sửa và gửi lại.</p>
        <label htmlFor={`reason-${kind}-${item.id}`} className="mb-1.5 block text-sm font-semibold text-slate-700">Lý do từ chối</label>
        <textarea
          id={`reason-${kind}-${item.id}`}
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          placeholder="Ví dụ: vui lòng bổ sung địa chỉ hoặc ảnh rõ hơn"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejecting(false)}>Quay lại</Button>
          <Button variant="danger" disabled={!reason.trim() || busy} onClick={reject}>{busy ? "Đang xử lý…" : "Xác nhận từ chối"}</Button>
        </div>
      </Modal>
    </Card>
  );
}

export default function AdminApprovals() {
  const [listings, setListings] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setListings(await api("/admin/approvals/"));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(kind, id, status, reason = "") {
    setBusy(`${kind}-${id}`);
    setError("");
    try {
      await api(`/admin/approvals/${kind}/${id}/decision/`, {
        method: "POST",
        body: { status, reason },
      });
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy("");
    }
  }

  const total = (listings?.homestays.length ?? 0) + (listings?.vehicles.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-800">KIỂM DUYỆT NỘI DUNG</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Tin đăng chờ duyệt</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Kiểm tra nội dung trước khi homestay hoặc phương tiện được hiển thị công khai.</p>
      </div>
      <Alert>{error}</Alert>
      {listings === null ? <LoadingState /> : total === 0 ? (
        <EmptyState title="Không có tin đăng chờ duyệt" description="Các tin đăng mới sẽ xuất hiện tại đây sau khi chủ nhà gửi yêu cầu." />
      ) : (
        <div className="space-y-8">
          {listings.homestays.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">Homestay <span className="text-slate-500">({listings.homestays.length})</span></h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {listings.homestays.map((item) => <ApprovalCard key={`homestay-${item.id}`} item={item} kind="homestay" busy={busy === `homestay-${item.id}`} onDecision={decide} />)}
              </div>
            </section>
          )}
          {listings.vehicles.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">Phương tiện <span className="text-slate-500">({listings.vehicles.length})</span></h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {listings.vehicles.map((item) => <ApprovalCard key={`vehicle-${item.id}`} item={item} kind="vehicle" busy={busy === `vehicle-${item.id}`} onDecision={decide} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
