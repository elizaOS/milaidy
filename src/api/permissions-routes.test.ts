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

  beforeEach(() => {
    state = {
      runtime: null,
      config: {} as MiladyConfig,
    };
    saveConfig = vi.fn();
    scheduleRuntimeRestart = vi.fn();
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
      _shellEnabled: true,
      _platform: "darwin",
    });
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

  test("rejects invalid nested permission id path", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/camera/extra",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Invalid permission ID" });
  });

  // ── GET /api/permissions/:id — existing permission ──────────────────
  test("returns existing permission by id", async () => {
    state.permissionStates = {
      microphone: {
        id: "microphone",
        status: "granted",
        lastChecked: 1000,
        canRequest: true,
      },
    };
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/microphone",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      id: "microphone",
      status: "granted",
      canRequest: true,
    });
  });

  // ── GET /api/permissions/:id — unknown permission ───────────────────
  test("returns not-applicable for unknown permission", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/bluetooth",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      id: "bluetooth",
      status: "not-applicable",
      canRequest: false,
    });
  });

  // ── POST /api/permissions/refresh ───────────────────────────────────
  test("requests permission refresh", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/refresh",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      action: "ipc:permissions:refresh",
    });
  });

  // ── POST /api/permissions/:id/request ───────────────────────────────
  test("requests a specific permission", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/camera/request",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      action: "ipc:permissions:request:camera",
    });
  });

  // ── POST /api/permissions/:id/open-settings ─────────────────────────
  test("opens settings for a specific permission", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/permissions/accessibility/open-settings",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      action: "ipc:permissions:openSettings:accessibility",
    });
  });

  // ── PUT /api/permissions/shell — disable without runtime ────────────
  test("disables shell without triggering restart when no runtime", async () => {
    // state.runtime is null by default (from beforeEach)
    const result = await invoke({
      method: "PUT",
      pathname: "/api/permissions/shell",
      body: { enabled: false },
    });

    expect(result.status).toBe(200);
    expect(state.shellEnabled).toBe(false);
    expect(state.config.features).toMatchObject({ shellEnabled: false });
    expect(saveConfig).toHaveBeenCalledWith(state.config);
    // No runtime → no restart scheduled
    expect(scheduleRuntimeRestart).not.toHaveBeenCalled();
  });

  // ── GET /api/permissions/shell — default enabled ────────────────────
  test("returns shell enabled by default", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/permissions/shell",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      enabled: true,
      id: "shell",
      status: "granted",
    });
  });
});
