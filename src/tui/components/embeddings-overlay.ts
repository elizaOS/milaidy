import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  type SelectItem,
  SelectList,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import { ModalFrame } from "./modal-frame.js";

export type EmbeddingTier = "fallback" | "standard" | "performance";

export interface EmbeddingOption {
  tier: EmbeddingTier;
  label: string;
  dimensions: number;
  downloaded: boolean;
  active: boolean;
}

export interface EmbeddingsOverlayOptions {
  options: EmbeddingOption[];
  onSelectTier: (tier: EmbeddingTier) => void;
  onCancel: () => void;
}

/**
 * Embedding preset selector shown as a popup overlay.
 */
export class EmbeddingsOverlayComponent implements Component, Focusable {
  focused = false;

  private selectList: SelectList;
  private frame = new ModalFrame({
    title: "Embedding models",
    hint: "↑↓ navigate • Enter select • Esc cancel",
  });

  constructor(options: EmbeddingsOverlayOptions) {
    const items: SelectItem[] = options.options.map((opt) => {
      const status = opt.active
        ? "active"
        : opt.downloaded
          ? "downloaded"
          : "not downloaded";

      return {
        value: opt.tier,
        label: `${opt.tier.padEnd(12)} ${opt.label}`,
        description: `${opt.dimensions} dims • ${status}`,
      };
    });

    this.selectList = new SelectList(items, 8, tuiTheme.selectList);

    const selectedIndex = options.options.findIndex((o) => o.active);
    if (selectedIndex >= 0) {
      this.selectList.setSelectedIndex(selectedIndex);
    }

    this.selectList.onSelect = (item) => {
      options.onSelectTier(item.value as EmbeddingTier);
    };

    this.selectList.onCancel = () => {
      options.onCancel();
    };
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    if (
      kb.matches(data, "selectUp") ||
      kb.matches(data, "selectDown") ||
      kb.matches(data, "selectConfirm") ||
      kb.matches(data, "selectCancel")
    ) {
      this.selectList.handleInput(data);
    }
  }

  render(width: number): string[] {
    return this.frame.render(width, this.selectList.render(width));
  }

  invalidate(): void {
    this.selectList.invalidate();
  }
}
