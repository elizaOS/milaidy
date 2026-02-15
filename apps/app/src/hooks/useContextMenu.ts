/**
 * Listens for context-menu IPC events from the Electron main process
 * and dispatches actions into the app state.
 */

import { useEffect, useState, useCallback } from "react";
import { useApp } from "../AppContext";

const COMMANDS_STORAGE_KEY = "milaidy:custom-commands";

export interface CustomCommand {
  name: string;
  text: string;
  createdAt: number;
}

/** Read saved custom commands from localStorage. */
export function loadCustomCommands(): CustomCommand[] {
  try {
    const raw = localStorage.getItem(COMMANDS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomCommand[]) : [];
  } catch {
    return [];
  }
}

/** Persist a new custom command to localStorage. */
function saveCustomCommand(cmd: CustomCommand): void {
  const existing = loadCustomCommands();
  existing.push(cmd);
  localStorage.setItem(COMMANDS_STORAGE_KEY, JSON.stringify(existing));
}

export interface ContextMenuState {
  saveCommandModalOpen: boolean;
  saveCommandText: string;
  customCommands: CustomCommand[];
  closeSaveCommandModal: () => void;
  confirmSaveCommand: (name: string) => void;
}

export function useContextMenu(): ContextMenuState {
  const { setState, chatInput, handleChatSend, setActionNotice } = useApp();

  const [saveCommandModalOpen, setSaveCommandModalOpen] = useState(false);
  const [saveCommandText, setSaveCommandText] = useState("");
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>(loadCustomCommands);

  useEffect(() => {
    const electron = (window as { electron?: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: unknown[]) => void) => void;
        removeAllListeners: (channel: string) => void;
      };
    } }).electron;
    if (!electron) return;

    const { ipcRenderer } = electron;

    const onSaveAsCommand = (...args: unknown[]) => {
      const payload = args[0] as { text: string } | undefined;
      if (!payload?.text) return;
      setSaveCommandText(payload.text);
      setSaveCommandModalOpen(true);
    };

    const onAskAgent = (...args: unknown[]) => {
      const payload = args[0] as { text: string } | undefined;
      if (!payload?.text) return;
      setState("chatInput", payload.text);
      // Defer send to next tick so chatInput state propagates
      setTimeout(() => handleChatSend(), 0);
    };

    const onCreateSkill = (...args: unknown[]) => {
      const payload = args[0] as { text: string } | undefined;
      if (!payload?.text) return;
      const prompt = `Create a skill from the following content:\n\n"""${payload.text}"""\n\nAnalyze this and create a reusable skill.`;
      setState("chatInput", prompt);
      setTimeout(() => handleChatSend(), 0);
    };

    const onQuoteInChat = (...args: unknown[]) => {
      const payload = args[0] as { text: string } | undefined;
      if (!payload?.text) return;
      const quoted = `> ${payload.text}\n\n`;
      setState("chatInput", quoted + chatInput);
    };

    ipcRenderer.on("contextMenu:saveAsCommand", onSaveAsCommand);
    ipcRenderer.on("contextMenu:askAgent", onAskAgent);
    ipcRenderer.on("contextMenu:createSkill", onCreateSkill);
    ipcRenderer.on("contextMenu:quoteInChat", onQuoteInChat);

    return () => {
      ipcRenderer.removeAllListeners("contextMenu:saveAsCommand");
      ipcRenderer.removeAllListeners("contextMenu:askAgent");
      ipcRenderer.removeAllListeners("contextMenu:createSkill");
      ipcRenderer.removeAllListeners("contextMenu:quoteInChat");
    };
  }, [setState, chatInput, handleChatSend, setActionNotice]);

  const closeSaveCommandModal = useCallback(() => {
    setSaveCommandModalOpen(false);
    setSaveCommandText("");
  }, []);

  const confirmSaveCommand = useCallback((name: string) => {
    const cmd: CustomCommand = { name, text: saveCommandText, createdAt: Date.now() };
    saveCustomCommand(cmd);
    setCustomCommands(loadCustomCommands());
    setSaveCommandModalOpen(false);
    setSaveCommandText("");
    setActionNotice(`Saved /${name} command`, "success");
  }, [saveCommandText, setActionNotice]);

  return {
    saveCommandModalOpen,
    saveCommandText,
    customCommands,
    closeSaveCommandModal,
    confirmSaveCommand,
  };
}
