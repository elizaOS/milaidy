import { useEffect } from "react";
import type { Tab } from "../navigation";

export function getNextTabForStreamPopoutEvent(_detail: unknown): Tab | null {
  return null;
}

export function useStreamPopoutNavigation(setTab: (tab: Tab) => void): void {
  useEffect(() => {
    const target =
      typeof window !== "undefined" ? window : (globalThis as EventTarget);
    const handler = (event: Event) => {
      const nextTab = getNextTabForStreamPopoutEvent(
        (event as CustomEvent).detail,
      );
      if (nextTab) {
        setTab(nextTab);
      }
    };

    target.addEventListener("stream-popout", handler);
    return () => target.removeEventListener("stream-popout", handler);
  }, [setTab]);
}
