type ElectronBridge = {
  ipcRenderer?: {
    invoke: (channel: string, params?: unknown) => Promise<unknown>;
  };
};

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

function getElectronBridge(): ElectronBridge["ipcRenderer"] | undefined {
  return (window as typeof window & { electron?: ElectronBridge }).electron
    ?.ipcRenderer;
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
  const ipc = getElectronBridge();
  if (!ipc) {
    return null;
  }

  return (await ipc.invoke(
    "desktop:showMessageBox",
    options,
  )) as DesktopMessageBoxResult;
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
