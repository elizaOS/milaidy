import { getByPath } from "../config-catalog";
import type {
  AuthState,
  ValidationCheck,
  VisibilityCondition,
} from "../ui-spec";

const BUILTIN_VALIDATORS: Record<
  string,
  (value: unknown, args?: Record<string, unknown>) => boolean
> = {
  email: (value) =>
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  max: (value, args) => Number(value) <= Number(args?.value ?? Infinity),
  maxLength: (value, args) =>
    typeof value === "string" && value.length <= Number(args?.length ?? Infinity),
  min: (value, args) => Number(value) >= Number(args?.value ?? -Infinity),
  minLength: (value, args) =>
    typeof value === "string" && value.length >= Number(args?.length ?? 0),
  pattern: (value, args) => {
    if (typeof value !== "string" || !args?.pattern) return true;
    try {
      return new RegExp(String(args.pattern)).test(value);
    } catch {
      return true;
    }
  },
  required: (value) => value != null && value !== "",
};

export function evaluateUiVisibility(
  condition: VisibilityCondition | undefined,
  state: Record<string, unknown>,
  auth?: AuthState,
): boolean {
  if (!condition) return true;

  if ("path" in condition && "operator" in condition) {
    const currentValue = getByPath(state, condition.path);
    const targetValue = condition.value;
    switch (condition.operator) {
      case "eq":
        return currentValue === targetValue;
      case "ne":
        return currentValue !== targetValue;
      case "gt":
        return Number(currentValue) > Number(targetValue);
      case "gte":
        return Number(currentValue) >= Number(targetValue);
      case "lt":
        return Number(currentValue) < Number(targetValue);
      case "lte":
        return Number(currentValue) <= Number(targetValue);
      default:
        return true;
    }
  }

  if ("auth" in condition) {
    if (!auth) return false;
    switch (condition.auth) {
      case "signedIn":
        return auth.isSignedIn;
      case "signedOut":
        return !auth.isSignedIn;
      case "admin":
        return auth.roles?.includes("admin") ?? false;
      default:
        return auth.roles?.includes(condition.auth) ?? false;
    }
  }

  if ("and" in condition) {
    return condition.and.every((entry) => evaluateUiVisibility(entry, state, auth));
  }
  if ("or" in condition) {
    return condition.or.some((entry) => evaluateUiVisibility(entry, state, auth));
  }
  if ("not" in condition) {
    return !evaluateUiVisibility(condition.not, state, auth);
  }

  return true;
}

export function runValidation(
  checks: ValidationCheck[],
  value: unknown,
  customValidators?: Record<
    string,
    (
      value: unknown,
      args?: Record<string, unknown>,
    ) => boolean | Promise<boolean>
  >,
): string[] {
  const errors: string[] = [];

  for (const check of checks) {
    const validator = customValidators?.[check.fn] ?? BUILTIN_VALIDATORS[check.fn];
    if (!validator) continue;

    try {
      const result = validator(value, check.args);
      if (result instanceof Promise) continue;
      if (!result) errors.push(check.message);
    } catch {
      errors.push(check.message);
    }
  }

  return errors;
}
