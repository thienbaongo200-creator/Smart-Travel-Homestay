import { useState } from "react";
import { addDays, pad, todayISO } from "../utils";

const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * busy: Set<ISO> - mỗi ngày d trong set nghĩa là ĐÊM bắt đầu từ d đã bị đặt/khóa.
 * => d không chọn được làm check-in; vẫn chọn được làm check-out nếu các đêm trước đó trống.
 */
export default function Calendar({ busy, checkIn, checkOut, onChange }) {
  const today = todayISO();
  const [view, setView] = useState(() => {
    const [y, m] = (checkIn || today).split("-").map(Number);
    return { y, m };
  });

  const offset = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7; // tuần bắt đầu T2
  const dim = new Date(view.y, view.m, 0).getDate();
  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: dim }, (_, i) => `${view.y}-${pad(view.m)}-${pad(i + 1)}`),
  ];

  const hasBusy = (a, b) => { for (let d = a; d < b; d = addDays(d, 1)) if (busy.has(d)) return true; return false; };

  function click(d) {
    if (d < today) return;
    const start = () => { if (!busy.has(d)) onChange({ checkIn: d, checkOut: "" }); };
    if (!checkIn || checkOut || d <= checkIn) return start();
    if (hasBusy(checkIn, d)) return start(); // khoảng chọn dính ngày đã kín
    onChange({ checkIn, checkOut: d });
  }

  const step = (n) => setView(({ y, m }) => {
    const t = new Date(y, m - 1 + n, 1);
    return { y: t.getFullYear(), m: t.getMonth() + 1 };
  });
  const atCurrent = view.y === Number(today.slice(0, 4)) && view.m <= Number(today.slice(5, 7));

  return (
    <div className="bg-white rounded-xl border p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <button disabled={atCurrent} onClick={() => step(-1)} className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-30">‹</button>
        <div className="font-semibold">{MONTHS[view.m - 1]} {view.y}</div>
        <button onClick={() => step(1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">
        {HEAD.map((h) => <div key={h}>{h}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const past = d < today;
          const isBusy = busy.has(d);
          const inRange = checkIn && checkOut && d > checkIn && d < checkOut;
          const edge = d === checkIn || d === checkOut;
          let cls = "h-9 rounded-lg text-sm flex items-center justify-center ";
          if (edge) cls += "bg-emerald-600 text-white font-semibold";
          else if (inRange) cls += "bg-emerald-100 text-emerald-900";
          else if (past) cls += "text-slate-300 cursor-not-allowed";
          else if (isBusy) cls += "bg-red-50 text-red-300 line-through cursor-not-allowed";
          else cls += "hover:bg-slate-100 cursor-pointer";
          return <button key={d} type="button" className={cls} onClick={() => click(d)}>{Number(d.slice(8))}</button>;
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-slate-500">
        <span><i className="inline-block w-3 h-3 rounded bg-emerald-600 align-middle" /> Đã chọn</span>
        <span><i className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200 align-middle" /> Đã kín</span>
      </div>
    </div>
  );
}
