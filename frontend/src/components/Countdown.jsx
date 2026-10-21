import { useEffect, useState } from "react";

export default function Countdown({ until, onExpire }) {
  const calc = () => Math.max(0, Math.floor((new Date(until) - Date.now()) / 1000));
  const [s, setS] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => {
      const v = calc();
      setS(v);
      if (v === 0) { clearInterval(t); onExpire?.(); }
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return <span className="font-mono">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}
