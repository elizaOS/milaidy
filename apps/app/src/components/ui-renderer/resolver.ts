import { getByPath } from "../config-catalog";
import type { CondExpr, UiRenderContext } from "../ui-spec";

export function resolveProp(value: unknown, ctx: UiRenderContext): unknown {
  if (value == null) return value;

  if (typeof value === "string" && value.startsWith("$data.")) {
    const path = value.slice(6);
    if (path.startsWith("$item/") && ctx.repeatItem) {
      return ctx.repeatItem[path.slice(6)];
    }
    return getByPath(ctx.state, path);
  }

  if (
    typeof value === "object" &&
    "$path" in (value as Record<string, unknown>)
  ) {
    const path = (value as { $path: string }).$path;
    if (path.startsWith("$item/") && ctx.repeatItem) {
      return ctx.repeatItem[path.slice(6)];
    }
    return getByPath(ctx.state, path);
  }

  if (
    typeof value === "object" &&
    "$cond" in (value as Record<string, unknown>)
  ) {
    const expr = value as CondExpr;
    const cond = expr.$cond;
    let result = false;

    if (cond.eq) {
      const [left, right] = cond.eq.map((entry) => resolveProp(entry, ctx));
      result = left === right;
    } else if (cond.neq) {
      const [left, right] = cond.neq.map((entry) => resolveProp(entry, ctx));
      result = left !== right;
    } else if (cond.gt) {
      const [left, right] = cond.gt.map((entry) => resolveProp(entry, ctx));
      result = Number(left) > Number(right);
    } else if (cond.lt) {
      const [left, right] = cond.lt.map((entry) => resolveProp(entry, ctx));
      result = Number(left) < Number(right);
    } else if (cond.truthy) {
      result = !!resolveProp(cond.truthy, ctx);
    } else if (cond.falsy) {
      result = !resolveProp(cond.falsy, ctx);
    } else if (cond.path) {
      result = !!getByPath(ctx.state, cond.path);
    }

    return result ? resolveProp(expr.$then, ctx) : resolveProp(expr.$else, ctx);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "path" in (value as Record<string, unknown>)
  ) {
    const path = (value as { path: string }).path;
    if (path.startsWith("$item/") && ctx.repeatItem) {
      return ctx.repeatItem[path.slice(6)];
    }
    return getByPath(ctx.state, path);
  }

  return value;
}

export function resolveProps(
  props: Record<string, unknown>,
  ctx: UiRenderContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    resolved[key] = resolveProp(value, ctx);
  }
  return resolved;
}
