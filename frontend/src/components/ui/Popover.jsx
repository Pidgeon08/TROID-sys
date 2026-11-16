import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FILTER_ACTIVE, FILTER_CONTROL, FILTER_IDLE } from "./filterStyles";

/**
 * A filter button that opens a panel below it. Clicking outside or pressing Escape closes it.
 * `align="right"` opens the panel toward the left, for buttons near a container's right edge.
 */
export function Popover({ label, icon: Icon, active, badge, children, width = "w-72", align = "left", className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${FILTER_CONTROL} ${active ? FILTER_ACTIVE : FILTER_IDLE} flex w-full items-center gap-2 whitespace-nowrap`}
      >
        <Icon size={15} className="shrink-0" />
        <span className="min-w-0 max-w-[220px] flex-1 truncate text-left">{label}</span>
        {badge ? <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{badge}</span> : null}
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1.5 ${width} max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg`}>
          {children}
        </div>
      )}
    </div>
  );
}
