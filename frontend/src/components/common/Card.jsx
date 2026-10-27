export default function Card({ className = "", children, ...props }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.025] ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
