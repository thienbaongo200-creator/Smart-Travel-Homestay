const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-800",
  info: "bg-sky-50 text-sky-800",
  violet: "bg-violet-50 text-violet-800",
};

export default function Badge({ tone = "neutral", className = "", children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone] ?? TONES.neutral} ${className}`}>
      {children}
    </span>
  );
}
