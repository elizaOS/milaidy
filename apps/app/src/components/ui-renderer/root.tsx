import React, { useCallback, useMemo, useState } from "react";
import { getByPath, setByPath } from "../config-catalog";
import type { AuthState, UiRenderContext, UiSpec } from "../ui-spec";
import { COMPONENTS } from "./components";
import { resolveProps } from "./resolver";
import { UiContext, useUiCtx } from "./shared";
import { evaluateUiVisibility, runValidation } from "./validators";

function ElementRenderer({ elementId }: { elementId: string }) {
  const ctx = useUiCtx();
  const element = ctx.spec.elements[elementId];
  if (!element) return null;

  if (
    element.visible &&
    !evaluateUiVisibility(element.visible, ctx.state, ctx.auth)
  ) {
    return null;
  }

  const component = COMPONENTS[element.type];
  if (!component) {
    return (
      <div className="text-[10px] text-[var(--destructive)] border border-dashed border-[var(--destructive)] p-2">
        Unknown component: {element.type}
      </div>
    );
  }

  const resolvedProps = resolveProps(element.props, ctx);

  if (element.repeat) {
    const listData = getByPath(ctx.state, element.repeat.path) as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(listData)) return null;

    return (
      <>
        {listData.map((item) => {
          const itemCtx: UiRenderContext = { ...ctx, repeatItem: item };
          const childNodes = element.children.map((childId) => (
            <UiContext.Provider key={childId} value={itemCtx}>
              <ElementRenderer elementId={childId} />
            </UiContext.Provider>
          ));
          const repeatKey = element.repeat?.key;
          const itemKey = String(
            repeatKey != null ? item[repeatKey] : Math.random(),
          );
          return (
            <React.Fragment key={itemKey}>
              {component(resolvedProps, childNodes, itemCtx, element)}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  const childNodes = element.children.map((childId) => (
    <ElementRenderer key={childId} elementId={childId} />
  ));

  return <>{component(resolvedProps, childNodes, ctx, element)}</>;
}

export interface UiRendererProps {
  spec: UiSpec;
  onAction?: (action: string, params?: Record<string, unknown>) => void;
  loading?: boolean;
  auth?: AuthState;
  validators?: Record<
    string,
    (
      value: unknown,
      args?: Record<string, unknown>,
    ) => boolean | Promise<boolean>
  >;
}

export function UiRenderer({
  spec,
  onAction,
  loading,
  auth,
  validators,
}: UiRendererProps) {
  const [state, setStateRaw] = useState<Record<string, unknown>>(() => ({
    ...spec.state,
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const setState = useCallback((path: string, value: unknown) => {
    setStateRaw((prev) => {
      const next = { ...prev };
      setByPath(next, path, value);
      return next;
    });
  }, []);

  const validateField = useCallback(
    (statePath: string) => {
      for (const element of Object.values(spec.elements)) {
        if (element.props.statePath === statePath && element.validation) {
          const value = getByPath(state, statePath);
          const errors = runValidation(element.validation.checks, value, validators);
          setFieldErrors((prev) => ({ ...prev, [statePath]: errors }));
          return;
        }
      }
    },
    [spec.elements, state, validators],
  );

  const ctx = useMemo<UiRenderContext>(
    () => ({
      spec,
      state,
      setState,
      onAction,
      auth,
      loading,
      validators,
      fieldErrors,
      validateField,
    }),
    [
      auth,
      fieldErrors,
      loading,
      onAction,
      setState,
      spec,
      state,
      validateField,
      validators,
    ],
  );

  if (loading && Object.keys(spec.elements).length === 0) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-4 bg-[var(--bg-hover)] w-3/4" />
        <div className="h-3 bg-[var(--bg-hover)] w-1/2" />
        <div className="h-3 bg-[var(--bg-hover)] w-5/6" />
      </div>
    );
  }

  return (
    <UiContext.Provider value={ctx}>
      <ElementRenderer elementId={spec.root} />
    </UiContext.Provider>
  );
}

export function getSupportedComponents(): string[] {
  return Object.keys(COMPONENTS);
}
