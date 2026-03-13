type ElectronBridge = {
  ipcRenderer?: {
    invoke: (channel: string, params?: unknown) => Promise<unknown>;
  };
};

function getElectronBridge(): ElectronBridge["ipcRenderer"] | undefined {
  return (window as typeof window & { electron?: ElectronBridge }).electron
    ?.ipcRenderer;
}

function copyTextWithExecCommand(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const ipc = getElectronBridge();
  if (ipc) {
    await ipc.invoke("desktop:writeToClipboard", { text });
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyTextWithExecCommand(text);
  }
}
