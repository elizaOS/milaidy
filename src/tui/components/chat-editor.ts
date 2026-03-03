import { Editor, matchesKey } from "@mariozechner/pi-tui";

/**
 * Small wrapper around @mariozechner/pi-tui's Editor to support Milady-wide keybindings.
 */
export class ChatEditor extends Editor {
  onCtrlC?: () => void;
  onCtrlP?: () => void;
  onCtrlE?: () => void;
  onAltU?: () => void;
  onCtrlG?: () => void;

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

    if (matchesKey(data, "alt+u")) {
      this.onAltU?.();
      return;
    }

    if (matchesKey(data, "ctrl+g")) {
      this.onCtrlG?.();
      return;
    }

    super.handleInput(data);
  }
}
