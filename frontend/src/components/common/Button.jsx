const VARIANTS = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-emerald-600",
  danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500",
  quiet: "text-slate-600 hover:bg-slate-100 focus-visible:ring-emerald-600",
};

export default function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`}
      {...props}
    />
  );
}
