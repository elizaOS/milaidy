/**
 * Re-exported from @milady/app-core.
 * @see packages/app-core/src/hooks/useStreamPopoutNavigation.ts
 *
 * The wrapper casts `string` to `Tab` so the app-specific setter type is
 * compatible with the generic hook signature.
 */
import { useStreamPopoutNavigation as _useStreamPopoutNavigation } from "@milady/app-core/hooks";
import type { Tab } from "@milady/app-core/navigation";

export { getNextTabForStreamPopoutEvent } from "@milady/app-core/hooks";

export function useStreamPopoutNavigation(setTab: (tab: Tab) => void): void {
  _useStreamPopoutNavigation(setTab as (tab: string) => void);
}
