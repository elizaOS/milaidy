import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  handlePermissionRoutes,
  type PermissionRouteState,
} from "./permissions-routes";

describe("permission routes", () => {
  let state: PermissionRouteState;
  let saveConfig: ReturnType<typeof vi.fn>;
  let scheduleRuntimeRestart: ReturnType<typeof vi.fn>;
  let emitPermissionTelemetry: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      runtime: null,
      config: {} as MiladyConfig,
    };
    saveConfig = vi.fn();
    scheduleRuntimeRestart = vi.fn();
    emitPermissionTelemetry = vi.fn();
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    PermissionRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handlePermissionRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        saveConfig,
        scheduleRuntimeRestart,
        emitPermissionTelemetry,
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-permission routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns permission summary", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      permissions: {},
      shellEnabled: true,
    });
  });

  test("returns permission definitions with applicability", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/definitions",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      platform: process.platform,
    });
    const permissions = (result.payload.permissions ?? []) as Array<
      Record<string, unknown>
    >;
    expect(permissions.length).toBeGreaterThan(0);
    const microphone = permissions.find((permission) => {
      return permission.id === "microphone";
    });
    expect(microphone).toMatchObject({
      id: "microphone",
      requiredForFeatures: expect.arrayContaining(["voice"]),
    });
    expect(typeof microphone?.applicable).toBe("boolean");
  });

  test("returns shell permission in compatibility shape", async () => {
    state.shellEnabled = false;
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/shell",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      enabled: false,
      id: "shell",
      status: "denied",
      canRequest: false,
      permission: {
        id: "shell",
        status: "denied",
      },
    });
  });

  test("updates shell state and persists config", async () => {
    state.runtime = {} as never;
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/shell",
      body: { enabled: true },
    });

    expect(result.status).toBe(200);
    expect(state.shellEnabled).toBe(true);
    expect(state.config.features).toMatchObject({ shellEnabled: true });
    expect(saveConfig).toHaveBeenCalledWith(state.config);
    expect(scheduleRuntimeRestart).toHaveBeenCalledWith("Shell access enabled");
    expect(emitPermissionTelemetry).toHaveBeenCalledTimes(1);
    expect(emitPermissionTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permissions_telemetry",
        source: "api",
        action: "shell-toggle",
        permissionId: "shell",
        method: "PUT",
        path: "/api/permissions/shell",
        enabled: true,
        previousEnabled: true,
        restartScheduled: true,
        ts: expect.any(Number),
      }),
    );
  });

  test("emits telemetry for permission request", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/microphone/request",
    });

    expect(result.status).toBe(200);
    expect(emitPermissionTelemetry).toHaveBeenCalledTimes(1);
    expect(emitPermissionTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permissions_telemetry",
        source: "api",
        action: "request",
        permissionId: "microphone",
        method: "POST",
        path: "/api/permissions/microphone/request",
        ts: expect.any(Number),
      }),
    );
  });

  test("emits telemetry for open-settings action", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/microphone/open-settings",
    });

    expect(result.status).toBe(200);
    expect(emitPermissionTelemetry).toHaveBeenCalledTimes(1);
    expect(emitPermissionTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "permissions_telemetry",
        source: "api",
        action: "open-settings",
        permissionId: "microphone",
        method: "POST",
        path: "/api/permissions/microphone/open-settings",
        ts: expect.any(Number),
      }),
    );
  });

  test("rejects unknown permission request IDs", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/not-a-real-permission/request",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Unknown permission ID" });
  });

  test("rejects malformed permission IDs for settings actions", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/%2F/open-settings",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Invalid permission ID" });
  });

  test("updates permission state payload from renderer", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/state",
      body: {
        permissions: {
          camera: {
            id: "camera",
            status: "granted",
            lastChecked: 123,
            canRequest: true,
          },
        },
      },
    });

    expect(result.status).toBe(200);
    expect(state.permissionStates).toMatchObject({
      camera: { status: "granted" },
    });
    expect(result.payload).toMatchObject({ updated: true });
  });

  test("sanitizes malformed renderer permission state entries", async () => {
    const before = Date.now();
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/state",
      body: {
        permissions: {
          camera: {
            status: "granted",
            lastChecked: 123,
            canRequest: true,
          },
          accessibility: {
            status: 42,
            lastChecked: Number.NaN,
            canRequest: "yes",
          } as unknown,
          "%2F": {
            status: "denied",
            lastChecked: 999,
            canRequest: false,
          },
          microphone: "invalid",
        },
      },
    });

    expect(result.status).toBe(200);
    expect(state.permissionStates).toMatchObject({
      camera: {
        id: "camera",
        status: "granted",
        lastChecked: 123,
        canRequest: true,
      },
      accessibility: {
        id: "accessibility",
        status: "not-determined",
        canRequest: false,
      },
    });
    expect(state.permissionStates).not.toHaveProperty("%2F");
    expect(state.permissionStates).not.toHaveProperty("microphone");
    const accessibilityLastChecked =
      state.permissionStates?.accessibility?.lastChecked ?? 0;
    expect(accessibilityLastChecked).toBeGreaterThanOrEqual(before);
  });

  test("rejects invalid nested permission id path", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/camera/extra",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Invalid permission ID" });
  });
});
