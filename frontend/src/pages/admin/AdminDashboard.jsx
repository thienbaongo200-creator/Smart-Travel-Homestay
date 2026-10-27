import { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import Alert from "../../components/common/Alert.jsx";
import Card from "../../components/common/Card.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import LoadingState from "../../components/common/LoadingState.jsx";
import { vnd } from "../../utils/index.js";

function Metric({ label, value, note, accent = "text-slate-950" }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-3 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </Card>
  );
}

const STATUS_LABELS = {
  HOLD: "Giữ chỗ",
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Hoàn thành",
  CANCELLED: "Đã hủy",
  REJECTED: "Bị từ chối",
  EXPIRED: "Hết hạn",
};

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/admin/overview/")
      .then((data) => { if (active) setOverview(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  if (!overview && !error) return <LoadingState />;

  const months = overview?.monthly_revenue ?? [];
  const maxRevenue = Math.max(1, ...months.map((month) => Number(month.revenue)));

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-semibold text-emerald-800">TỔNG QUAN</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Trung tâm quản trị</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Theo dõi hoạt động nền tảng, doanh thu đã thanh toán và các việc đang chờ xử lý.</p>
      </div>
      <Alert>{error}</Alert>
      {!overview ? (
        <EmptyState title="Chưa tải được dữ liệu" description="Vui lòng thử tải lại trang hoặc kiểm tra kết nối tới máy chủ." />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số hệ thống">
            <Metric label="Tổng người dùng" value={overview.users_total.toLocaleString("vi-VN")} note={`${overview.users_active.toLocaleString("vi-VN")} tài khoản đang hoạt động`} />
            <Metric label="Doanh thu đã thanh toán" value={vnd(overview.revenue_total)} note="Cộng từ giao dịch thành công" accent="text-emerald-800" />
            <Metric label="Tin cần duyệt" value={overview.pending_approvals.toLocaleString("vi-VN")} note="Homestay và phương tiện" accent={overview.pending_approvals ? "text-amber-700" : "text-slate-950"} />
            <Metric label="Tổng đơn đặt" value={overview.bookings_total.toLocaleString("vi-VN")} note={`${overview.homestays_total} homestay · ${overview.vehicles_total} phương tiện`} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Doanh thu gần đây</h2>
                  <p className="mt-1 text-sm text-slate-500">Theo tháng, từ các thanh toán thành công</p>
                </div>
                {months.length > 0 && <span className="text-sm font-semibold text-emerald-800">{vnd(months.reduce((sum, item) => sum + Number(item.revenue), 0))}</span>}
              </div>
              {months.length === 0 ? (
                <div className="mt-6"><EmptyState title="Chưa có thanh toán thành công" description="Biểu đồ sẽ hiển thị khi nền tảng ghi nhận giao dịch." /></div>
              ) : (
                <div className="mt-8 flex h-56 items-end gap-3 overflow-x-auto border-b border-slate-200 pb-2 sm:gap-5" role="img" aria-label="Biểu đồ cột doanh thu theo tháng">
                  {months.map((month) => {
                    const height = Math.max(5, (Number(month.revenue) / maxRevenue) * 100);
                    return (
                      <div key={month.month} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
                        <span className="whitespace-nowrap text-[11px] font-semibold text-slate-600">{(Number(month.revenue) / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr</span>
                        <div className="w-full rounded-t-lg bg-emerald-700" style={{ height: `${height}%`, minHeight: "8px" }} title={`${month.month}: ${vnd(month.revenue)}`} />
                        <span className="text-xs text-slate-500">{month.month}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-slate-950">Đơn theo trạng thái</h2>
              <p className="mt-1 text-sm text-slate-500">Tổng hợp toàn nền tảng</p>
              <div className="mt-5 divide-y divide-slate-100">
                {Object.entries(overview.bookings_by_status).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-slate-600">{STATUS_LABELS[key] ?? key}</span>
                    <span className="font-bold tabular-nums text-slate-950">{count.toLocaleString("vi-VN")}</span>
                  </div>
                ))}
                {Object.keys(overview.bookings_by_status).length === 0 && <p className="py-5 text-sm text-slate-500">Chưa có đơn đặt nào.</p>}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
