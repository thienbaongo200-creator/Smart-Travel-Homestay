export default function LoadingState({ label = "Đang tải dữ liệu…" }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-slate-600" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-r-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}
