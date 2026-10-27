const COLORS = {
  error: "border-rose-200 bg-rose-50 text-rose-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export default function Alert({ tone = "error", className = "", children }) {
  if (!children) return null;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${COLORS[tone] ?? COLORS.info} ${className}`}>
      {children}
    </div>
  );
}
