import { invokeDesktopBridgeRequest } from "@milady/app-core/bridge";

export async function openExternalUrl(url: string): Promise<void> {
  const opened = await invokeDesktopBridgeRequest({
    rpcMethod: "desktopOpenExternal",
    params: { url },
  });
  if (opened !== null) {
    return;
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Popup blocked. Allow popups and try again.");
  }
}
