import React, { createContext, useCallback, useContext } from "react";
import { getByPath } from "../config-catalog";
import type { UiElement, UiRenderContext } from "../ui-spec";

export const UiContext = createContext<UiRenderContext | null>(null);

export function useUiCtx(): UiRenderContext {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("UiRenderer context missing");
  return ctx;
}

export function useStatePath(
  statePath: string | undefined,
  ctx: UiRenderContext,
) {
  const value = statePath ? getByPath(ctx.state, statePath) : undefined;
  const setValue = useCallback(
    (nextValue: unknown) => {
      if (statePath) ctx.setState(statePath, nextValue);
    },
    [ctx, statePath],
  );
  return [value, setValue] as const;
}

export type ComponentFn = (
  props: Record<string, unknown>,
  children: React.ReactNode[],
  ctx: UiRenderContext,
  el: UiElement,
) => React.ReactNode;

export const GAP: Record<string, string> = {
  lg: "gap-4",
  md: "gap-3",
  none: "gap-0",
  sm: "gap-2",
  xl: "gap-6",
  xs: "gap-1",
};

export const ALIGN: Record<string, string> = {
  center: "items-center",
  end: "items-end",
  start: "items-start",
  stretch: "items-stretch",
};

export const JUSTIFY: Record<string, string> = {
  between: "justify-between",
  center: "justify-center",
  end: "justify-end",
  start: "justify-start",
};

export const INPUT_CLS =
  "w-full px-2 py-[5px] border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none box-border";
