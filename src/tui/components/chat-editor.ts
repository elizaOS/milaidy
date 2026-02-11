import { Editor, matchesKey } from "@elizaos/tui";

/**
 * Small wrapper around pi-tui's Editor to support Milaidy-wide keybindings.
 */
export class ChatEditor extends Editor {
  onCtrlC?: () => void;
  onCtrlP?: () => void;
  onCtrlE?: () => void;

  override handleInput(data: string): void {
    if (matchesKey(data, "ctrl+c")) {
      this.onCtrlC?.();
      return;
    }

    if (matchesKey(data, "ctrl+p")) {
      this.onCtrlP?.();
      return;
    }

    if (matchesKey(data, "ctrl+e")) {
      this.onCtrlE?.();
      return;
    }

    super.handleInput(data);
  }
}
