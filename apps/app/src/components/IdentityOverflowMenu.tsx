import { useEffect, useRef, useState } from "react";

interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  hidden?: boolean;
}

export function IdentityOverflowMenu({ items }: { items: OverflowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !open ||
      typeof document === "undefined" ||
      typeof document.addEventListener !== "function" ||
      typeof document.removeEventListener !== "function"
    ) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visible = items.filter((item) => !item.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="anime-wallet-identity-overflow">
      <button
        type="button"
        className="anime-wallet-identity-btn anime-wallet-identity-overflow-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        ···
      </button>
      {open ? (
        <div className="anime-wallet-identity-overflow-menu">
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              className="anime-wallet-identity-overflow-item"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
