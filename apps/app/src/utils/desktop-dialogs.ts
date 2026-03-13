import { invokeDesktopBridgeRequest } from "@milady/app-core/bridge";

type DesktopMessageBoxType = "info" | "warning" | "error" | "question";

interface DesktopMessageBoxOptions {
  type?: DesktopMessageBoxType;
  title?: string;
  message: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}

interface DesktopMessageBoxResult {
  response: number;
}

interface DesktopConfirmOptions {
  title: string;
  message?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: DesktopMessageBoxType;
}

interface DesktopAlertOptions {
  title: string;
  message?: string;
  detail?: string;
  buttonLabel?: string;
  type?: DesktopMessageBoxType;
}

function buildFallbackMessage(options: {
  title?: string;
  message?: string;
  detail?: string;
}): string {
  return [options.title, options.message, options.detail]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join("\n\n");
}

async function showDesktopMessageBox(
  options: DesktopMessageBoxOptions,
): Promise<DesktopMessageBoxResult | null> {
  return await invokeDesktopBridgeRequest<DesktopMessageBoxResult>({
    rpcMethod: "desktopShowMessageBox",
    ipcChannel: "desktop:showMessageBox",
    params: options,
  });
}

export async function confirmDesktopAction(
  options: DesktopConfirmOptions,
): Promise<boolean> {
  const result = await showDesktopMessageBox({
    type: options.type ?? "question",
    title: options.title,
    message: options.message ?? "",
    detail: options.detail,
    buttons: [
      options.confirmLabel ?? "Confirm",
      options.cancelLabel ?? "Cancel",
    ],
    defaultId: 0,
    cancelId: 1,
  });

  if (result) {
    return result.response === 0;
  }

  return window.confirm(buildFallbackMessage(options));
}

export async function alertDesktopMessage(
  options: DesktopAlertOptions,
): Promise<void> {
  const result = await showDesktopMessageBox({
    type: options.type ?? "info",
    title: options.title,
    message: options.message ?? "",
    detail: options.detail,
    buttons: [options.buttonLabel ?? "OK"],
    defaultId: 0,
    cancelId: 0,
  });

  if (result) {
    return;
  }

  window.alert(buildFallbackMessage(options));
}
