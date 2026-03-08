import type { UiAction, UiRenderContext } from "../ui-spec";
import { resolveProps } from "./resolver";

export function fireEvent(action: UiAction | undefined, ctx: UiRenderContext) {
  if (!action) return;

  const resolvedParams =
    action.params && typeof action.params === "object"
      ? resolveProps(action.params, ctx)
      : action.params;

  const execute = () => {
    if (action.action === "setState" && resolvedParams) {
      const params = resolvedParams as { path: string; value: unknown };
      ctx.setState(params.path, params.value);
      if (action.onSuccess && ctx.onAction) {
        ctx.onAction(action.onSuccess.action, action.onSuccess.params);
      }
      return;
    }

    if (!ctx.onAction) return;
    try {
      ctx.onAction(action.action, resolvedParams);
      if (action.onSuccess) {
        ctx.onAction(action.onSuccess.action, action.onSuccess.params);
      }
    } catch {
      if (action.onError) {
        ctx.onAction(action.onError.action, action.onError.params);
      }
    }
  };

  if (action.confirm) {
    const ok = window.confirm(
      action.confirm.message
        ? `${action.confirm.title}\n\n${action.confirm.message}`
        : action.confirm.title,
    );
    if (ok) execute();
    return;
  }

  execute();
}
