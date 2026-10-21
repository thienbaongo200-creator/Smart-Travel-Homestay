export const vnd = (n) => new Intl.NumberFormat("vi-VN").format(Number(n)) + "₫";
export const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
};
export function addDays(iso, n) {
  const [y, m, d] = parse(iso);
  return toISO(new Date(y, m - 1, d + n));
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = parse(a);
  const [y2, m2, d2] = parse(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export function dayLabel(iso) {
  const [y, m, d] = parse(iso);
  return `${WD[new Date(y, m - 1, d).getDay()]} ${pad(d)}/${pad(m)}`;
}

export const STATUS = {
  HOLD: ["Đang giữ chỗ - chờ thanh toán cọc", "bg-amber-100 text-amber-800"],
  PENDING: ["Chờ chủ xác nhận", "bg-blue-100 text-blue-800"],
  CONFIRMED: ["Đã xác nhận", "bg-green-100 text-green-800"],
  CHECKED_IN: ["Đang lưu trú", "bg-green-100 text-green-800"],
  CHECKED_OUT: ["Đã hoàn thành", "bg-slate-200 text-slate-700"],
  CANCELLED: ["Đã hủy", "bg-slate-200 text-slate-700"],
  REJECTED: ["Bị từ chối", "bg-red-100 text-red-800"],
  EXPIRED: ["Hết hạn giữ chỗ", "bg-slate-200 text-slate-700"],
};
