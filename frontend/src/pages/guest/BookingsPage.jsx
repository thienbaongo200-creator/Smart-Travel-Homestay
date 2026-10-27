import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../services/api.js";
import Countdown from "../../components/domain/Countdown.jsx";
import Alert from "../../components/common/Alert.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";
import { STATUS, vnd } from "../../utils/index.js";

const TONES = {
  HOLD: "warning",
  PENDING: "info",
  CONFIRMED: "success",
  CHECKED_IN: "success",
  CHECKED_OUT: "neutral",
  CANCELLED: "neutral",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export default function BookingsPage() {
  const [sp] = useSearchParams();
  const highlight = sp.get("new");
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => api("/bookings/").then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function pay(code, success) {
    setBusy(code);
    setErr("");
    try {
      await api(`/bookings/${code}/pay/`, { method: "POST" });
      await api(`/bookings/${code}/mock-pay/`, { method: "POST", body: { success } });
      await load();
    } catch (e) {
      setErr(e.message);
      await load();
    } finally {
      setBusy("");
    }
  }

  if (!list) return err ? <Alert>{err}</Alert> : <LoadingState />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-800">CHUYẾN ĐI CỦA BẠN</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Đơn đặt của tôi</h1>
        <p className="mt-2 text-sm text-slate-600">Theo dõi xác nhận, thanh toán và thời hạn giữ chỗ.</p>
      </div>
      <Alert>{err}</Alert>
      {list.length === 0 && <EmptyState title="Bạn chưa có đơn đặt nào" description="Khi bạn đặt chỗ nghỉ, thông tin chuyến đi sẽ hiển thị tại đây." />}
      {list.map((booking) => {
        const [label] = STATUS[booking.status] ?? [booking.status];
        return (
          <Card key={booking.code} className={`p-5 sm:p-6 ${booking.code === highlight ? "ring-2 ring-emerald-600 ring-offset-2" : ""}`}>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mã đơn · {booking.code}</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{booking.check_in} <span className="text-slate-400">→</span> {booking.check_out}</div>
              </div>
              <Badge tone={TONES[booking.status]}>{label}</Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
              <div><p className="text-xs text-slate-500">Tổng cộng</p><p className="mt-1 font-bold text-slate-900">{vnd(booking.total)}</p></div>
              <div><p className="text-xs text-slate-500">Tiền đặt cọc</p><p className="mt-1 font-bold text-slate-900">{vnd(booking.deposit)}</p></div>
            </div>
            {booking.status === "HOLD" && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">Thời gian giữ chỗ còn <Countdown until={booking.hold_expires_at} onExpire={load} /></p>
                <p className="mt-1 text-xs leading-5 text-amber-900">Hoàn tất đặt cọc trước khi hết thời gian để tiếp tục đơn đặt.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button disabled={busy === booking.code} onClick={() => pay(booking.code, true)}>
                    {busy === booking.code ? "Đang xử lý…" : "Thanh toán cọc"}
                  </Button>
                  {import.meta.env.DEV && (
                    <Button variant="secondary" disabled={busy === booking.code} onClick={() => pay(booking.code, false)}>
                      Mô phỏng thanh toán lỗi
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
