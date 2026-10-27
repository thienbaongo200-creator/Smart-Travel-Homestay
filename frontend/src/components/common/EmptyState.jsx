export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-800" aria-hidden="true">
        <span className="text-xl">⌂</span>
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
