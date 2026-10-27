import Alert from "../common/Alert.jsx";
import BadgeBase from "../common/Badge.jsx";
import { STATUS } from "../../utils/index.js";

export const APPROVAL = {
  PENDING: ["Chờ admin duyệt", "bg-amber-100 text-amber-800"],
  APPROVED: ["Đã duyệt", "bg-green-100 text-green-800"],
  REJECTED: ["Bị từ chối", "bg-red-100 text-red-800"],
  SUSPENDED: ["Tạm khóa", "bg-slate-200 text-slate-700"],
};
export const SLOT = { ...STATUS, HOLD: ["Khách đang thanh toán", "bg-amber-100 text-amber-800"], BLOCKED: ["Chủ chặn lịch", "bg-slate-300 text-slate-800"] };

export const inp = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";
export const btn = "inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost = "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function Badge({ map, k }) {
  const [label, color] = map[k] ?? [k, "neutral"];
  const tone = color.includes("red") ? "danger" : color.includes("amber") ? "warning" : color.includes("green") ? "success" : color.includes("blue") ? "info" : "neutral";
  return <BadgeBase tone={tone}>{label}</BadgeBase>;
}

export function ErrBox({ msg }) {
  return <Alert>{msg}</Alert>;
}