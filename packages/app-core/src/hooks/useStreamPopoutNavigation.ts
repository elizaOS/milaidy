import { useEffect } from "react";

/**
 * Tab type — a navigation destination in the app.
 * Defined locally so this hook has no dependency on the apps/app navigation
 * module. Callers must provide a compatible setter.
 */
export type Tab = string;

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
