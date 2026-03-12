type ElectronBridge = {
  ipcRenderer?: {
    invoke: (channel: string, params?: unknown) => Promise<unknown>;
  };
};

export async function openExternalUrl(url: string): Promise<void> {
  const electron = (window as typeof window & { electron?: ElectronBridge })
    .electron;

  if (electron?.ipcRenderer) {
    await electron.ipcRenderer.invoke("desktop:openExternal", { url });
    return;
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Popup blocked. Allow popups and try again.");
  }
}
