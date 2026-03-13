import { invokeDesktopBridgeRequest } from "@milady/app-core/bridge";

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
  const copied = await invokeDesktopBridgeRequest({
    rpcMethod: "desktopWriteToClipboard",
    params: { text },
  });
  if (copied !== null) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyTextWithExecCommand(text);
  }
}
