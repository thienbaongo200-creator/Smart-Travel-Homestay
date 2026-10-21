import { dayLabel, vnd } from "../utils";

function Badges({ l }) {
  const out = [];
  const df = Number(l.day_factor), of = Number(l.occupancy_factor), lf = Number(l.lead_factor);
  if (df !== 1) out.push([`Cuối tuần/Lễ/Mùa ×${df}`, "bg-orange-100 text-orange-800"]);
  if (of !== 1) out.push([`Lấp đầy ×${of}`, "bg-purple-100 text-purple-800"]);
  if (lf !== 1) out.push([lf < 1 ? `Đặt sớm ×${lf}` : `Sát ngày ×${lf}`, "bg-sky-100 text-sky-800"]);
  return out.map(([t, c]) => <span key={t} className={`ml-1 px-1.5 py-0.5 rounded text-[11px] ${c}`}>{t}</span>);
}

function Section({ title, data }) {
  return (
    <>
      <tr className="bg-slate-50 font-semibold"><td colSpan={2} className="py-1.5 px-2">{title}</td></tr>
      {data.lines.map((l) => (
        <tr key={l.date} className="border-b last:border-0">
          <td className="py-1.5 px-2">{dayLabel(l.date)} <Badges l={l} /></td>
          <td className="py-1.5 px-2 text-right">{vnd(l.price)}</td>
        </tr>
      ))}
    </>
  );
}

export default function QuoteTable({ quote, vehicleName }) {
  const discount = Number(quote.combo_discount);
  return (
    <table className="w-full text-sm bg-white rounded-xl border overflow-hidden">
      <tbody>
        <Section title={`Phòng - ${quote.nights} đêm`} data={quote.room} />
        {quote.vehicle && <Section title={`Xe: ${vehicleName}`} data={quote.vehicle} />}
        {discount > 0 && (
          <tr className="text-emerald-700"><td className="py-1.5 px-2">Giảm giá combo phòng + xe</td><td className="py-1.5 px-2 text-right">−{vnd(discount)}</td></tr>
        )}
        <tr className="border-t font-bold text-base"><td className="py-2 px-2">Tổng cộng</td><td className="py-2 px-2 text-right">{vnd(quote.total)}</td></tr>
        <tr className="text-slate-600"><td className="py-1 px-2">Đặt cọc</td><td className="py-1 px-2 text-right">{vnd(quote.deposit)}</td></tr>
      </tbody>
    </table>
  );
}
