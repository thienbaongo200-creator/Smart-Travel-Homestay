import { STATUS } from "../../utils";

export const APPROVAL = {
  PENDING: ["Chờ admin duyệt", "bg-amber-100 text-amber-800"],
  APPROVED: ["Đã duyệt", "bg-green-100 text-green-800"],
  REJECTED: ["Bị từ chối", "bg-red-100 text-red-800"],
  SUSPENDED: ["Tạm khóa", "bg-slate-200 text-slate-700"],
};
export const SLOT = { ...STATUS, HOLD: ["Khách đang thanh toán", "bg-amber-100 text-amber-800"], BLOCKED: ["Chủ chặn lịch", "bg-slate-300 text-slate-800"] };

export const inp = "mt-1 w-full border rounded-lg px-3 py-2 text-sm";
export const btn = "px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50";
export const btnGhost = "px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50 disabled:opacity-50";

export function Badge({ map, k }) {
  const [label, color] = map[k] ?? [k, "bg-slate-200"];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

export function ErrBox({ msg }) {
  return msg ? <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{msg}</div> : null;
}