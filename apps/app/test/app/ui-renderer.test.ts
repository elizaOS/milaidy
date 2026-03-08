import { describe, expect, it, vi } from "vitest";

import { fireEvent } from "../../src/components/ui-renderer/events";
import { resolveProp, resolveProps } from "../../src/components/ui-renderer/resolver";
import {
  evaluateUiVisibility,
  runValidation,
} from "../../src/components/ui-renderer/validators";
import type { UiRenderContext } from "../../src/components/ui-spec";

function createContext(
  overrides?: Partial<UiRenderContext>,
): UiRenderContext {
  return {
    auth: { isSignedIn: true, roles: ["admin"] },
    fieldErrors: {},
    loading: false,
    onAction: vi.fn(),
    repeatItem: { id: "repeat-1", label: "Repeat item" },
    setState: vi.fn(),
    spec: {
      root: "root",
      elements: {},
      state: {},
    },
    state: {
      form: {
        enabled: true,
        name: "Milady",
      },
    },
    validateField: vi.fn(),
    validators: {},
    ...overrides,
  };
}

describe("ui-renderer helpers", () => {
  it("resolves state and repeat item references", () => {
    const ctx = createContext();

    expect(resolveProp({ $path: "form/name" }, ctx)).toBe("Milady");
    expect(resolveProp({ $path: "$item/label" }, ctx)).toBe("Repeat item");
    expect(
      resolveProps(
        {
          id: { $path: "$item/id" },
          name: { $path: "form/name" },
        },
        ctx,
      ),
    ).toEqual({
      id: "repeat-1",
      name: "Milady",
    });
  });

  it("evaluates nested visibility conditions", () => {
    const state = {
      form: { enabled: true, step: 2 },
    };

    expect(
      evaluateUiVisibility(
        {
          and: [
            { path: "form/enabled", operator: "eq", value: true },
            { not: { path: "form/step", operator: "lt", value: 2 } },
            { auth: "admin" },
          ],
        },
        state,
        { isSignedIn: true, roles: ["admin"] },
      ),
    ).toBe(true);
  });

  it("runs built-in validation checks deterministically", () => {
    expect(
      runValidation(
        [
          { fn: "required", message: "required" },
          {
            fn: "minLength",
            args: { length: 6 },
            message: "too short",
          },
        ],
        "mila",
      ),
    ).toEqual(["too short"]);
  });

  it("resolves action params before dispatching events", () => {
    const onAction = vi.fn();
    const setState = vi.fn();
    const ctx = createContext({ onAction, setState });

    fireEvent(
      {
        action: "client.voice.save",
        params: {
          enabled: { $path: "form/enabled" },
          selectedItem: { $path: "$item/id" },
        },
      },
      ctx,
    );

    expect(onAction).toHaveBeenCalledWith("client.voice.save", {
      enabled: true,
      selectedItem: "repeat-1",
    });
    expect(setState).not.toHaveBeenCalled();
  });
});
