export default function Input({ id, label, hint, className = "", inputClassName = "", ...props }) {
  const describedBy = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>}
      <input
        id={id}
        aria-describedby={describedBy}
        className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 ${inputClassName}`}
        {...props}
      />
      {hint && <p id={describedBy} className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
