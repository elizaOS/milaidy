/**
 * Listens for context-menu IPC events from the Electron main process
 * and dispatches actions into the app state.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppContext";
import {
  appendSavedCustomCommand,
  loadSavedCustomCommands,
  type SavedCustomCommand,
} from "../chat-commands";

export type CustomCommand = SavedCustomCommand;

/** Read saved custom commands from localStorage. */
export function loadCustomCommands(): CustomCommand[] {
  return loadSavedCustomCommands();
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
  const [customCommands, setCustomCommands] =
    useState<CustomCommand[]>(loadCustomCommands);

  useEffect(() => {
    const electron = (
      window as {
        electron?: {
          ipcRenderer: {
            on: (
              channel: string,
              listener: (...args: unknown[]) => void,
            ) => void;
            removeAllListeners: (channel: string) => void;
          };
        };
      }
    ).electron;
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
  }, [setState, chatInput, handleChatSend]);

  const closeSaveCommandModal = useCallback(() => {
    setSaveCommandModalOpen(false);
    setSaveCommandText("");
  }, []);

  const confirmSaveCommand = useCallback(
    (name: string) => {
      const cmd: CustomCommand = {
        name,
        text: saveCommandText,
        createdAt: Date.now(),
      };
      appendSavedCustomCommand(cmd);
      setCustomCommands(loadCustomCommands());
      setSaveCommandModalOpen(false);
      setSaveCommandText("");
      setActionNotice(`Saved /${name} command`, "success");
    },
    [saveCommandText, setActionNotice],
  );

  return {
    saveCommandModalOpen,
    saveCommandText,
    customCommands,
    closeSaveCommandModal,
    confirmSaveCommand,
  };
}
