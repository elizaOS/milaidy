import { useApp } from "../AppContext";

/**
 * Renders amber warning banners for system-level warnings
 * (connector failures, coordinator wiring exhaustion, etc.)
 * broadcast via WebSocket `system-warning` events.
 */
export function SystemWarningBanner() {
  const { systemWarnings, dismissSystemWarning } = useApp();

  if (!systemWarnings?.length) return null;

  return (
    <>
      {systemWarnings.map((message, index) => (
        <div
          key={message}
          className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-[13px] font-medium text-white shadow-lg"
          style={{ top: `${index * 36}px` }}
        >
          <span className="truncate">{message}</span>
          <button
            type="button"
            onClick={() => dismissSystemWarning(index)}
            className="rounded px-2 py-0.5 text-[12px] text-amber-100 hover:bg-amber-600 transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </>
  );
}
