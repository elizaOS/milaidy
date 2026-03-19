import type { client as appClient } from "@elizaos/app-core/api";
import { invokeDesktopBridgeRequest } from "@elizaos/app-core/bridge";

const PATCH_STATE = Symbol.for("milady.desktopPermissionsPatch");

type SystemPermissionId = Parameters<typeof appClient.getPermission>[0];
type PermissionState = Awaited<ReturnType<typeof appClient.getPermission>>;
type AllPermissionsState = Awaited<ReturnType<typeof appClient.getPermissions>>;

type ClientLike = Pick<
  typeof appClient,
  | "getPermissions"
  | "getPermission"
  | "requestPermission"
  | "openPermissionSettings"
  | "refreshPermissions"
  | "setShellEnabled"
  | "isShellEnabled"
> &
  Record<string | symbol, unknown>;

type PatchState = {
  getPermissions: ClientLike["getPermissions"];
  getPermission: ClientLike["getPermission"];
  requestPermission: ClientLike["requestPermission"];
  openPermissionSettings: ClientLike["openPermissionSettings"];
  refreshPermissions: ClientLike["refreshPermissions"];
  setShellEnabled: ClientLike["setShellEnabled"];
  isShellEnabled: ClientLike["isShellEnabled"];
};

export function installDesktopPermissionsClientPatch(
  client: ClientLike,
): () => void {
  const existingPatch = client[PATCH_STATE] as PatchState | undefined;
  if (existingPatch) {
    return () => {};
  }

  const originalGetPermissions = client.getPermissions.bind(client);
  const originalGetPermission = client.getPermission.bind(client);
  const originalRequestPermission = client.requestPermission.bind(client);
  const originalOpenPermissionSettings =
    client.openPermissionSettings.bind(client);
  const originalRefreshPermissions = client.refreshPermissions.bind(client);
  const originalSetShellEnabled = client.setShellEnabled.bind(client);
  const originalIsShellEnabled = client.isShellEnabled.bind(client);

  client[PATCH_STATE] = {
    getPermissions: client.getPermissions,
    getPermission: client.getPermission,
    requestPermission: client.requestPermission,
    openPermissionSettings: client.openPermissionSettings,
    refreshPermissions: client.refreshPermissions,
    setShellEnabled: client.setShellEnabled,
    isShellEnabled: client.isShellEnabled,
  } satisfies PatchState;

  client.getPermissions = async () => {
    const bridged = await invokeDesktopBridgeRequest<AllPermissionsState>({
      rpcMethod: "permissionsGetAll",
      ipcChannel: "permissions:getAll",
    });
    return bridged ?? originalGetPermissions();
  };

  client.getPermission = async (id: SystemPermissionId) => {
    const bridged = await invokeDesktopBridgeRequest<PermissionState>({
      rpcMethod: "permissionsCheck",
      ipcChannel: "permissions:check",
      params: { id },
    });
    return bridged ?? originalGetPermission(id);
  };

  client.requestPermission = async (id: SystemPermissionId) => {
    const bridged = await invokeDesktopBridgeRequest<PermissionState>({
      rpcMethod: "permissionsRequest",
      ipcChannel: "permissions:request",
      params: { id },
    });
    return bridged ?? originalRequestPermission(id);
  };

  client.openPermissionSettings = async (id: SystemPermissionId) => {
    const bridged = await invokeDesktopBridgeRequest<void>({
      rpcMethod: "permissionsOpenSettings",
      ipcChannel: "permissions:openSettings",
      params: { id },
    });
    if (bridged !== null) {
      return;
    }
    return originalOpenPermissionSettings(id);
  };

  client.refreshPermissions = async () => {
    const bridged = await invokeDesktopBridgeRequest<AllPermissionsState>({
      rpcMethod: "permissionsGetAll",
      ipcChannel: "permissions:getAll",
      params: { forceRefresh: true },
    });
    return bridged ?? originalRefreshPermissions();
  };

  client.setShellEnabled = async (enabled: boolean) => {
    const bridged = await invokeDesktopBridgeRequest<PermissionState>({
      rpcMethod: "permissionsSetShellEnabled",
      ipcChannel: "permissions:setShellEnabled",
      params: { enabled },
    });
    return bridged ?? originalSetShellEnabled(enabled);
  };

  client.isShellEnabled = async () => {
    const bridged = await invokeDesktopBridgeRequest<boolean>({
      rpcMethod: "permissionsIsShellEnabled",
      ipcChannel: "permissions:isShellEnabled",
    });
    return bridged ?? originalIsShellEnabled();
  };

  return () => {
    const patchState = client[PATCH_STATE] as PatchState | undefined;
    if (!patchState) {
      return;
    }
    client.getPermissions = patchState.getPermissions;
    client.getPermission = patchState.getPermission;
    client.requestPermission = patchState.requestPermission;
    client.openPermissionSettings = patchState.openPermissionSettings;
    client.refreshPermissions = patchState.refreshPermissions;
    client.setShellEnabled = patchState.setShellEnabled;
    client.isShellEnabled = patchState.isShellEnabled;
    delete client[PATCH_STATE];
  };
}
