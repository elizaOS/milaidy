import {
  type Api,
  getEnvApiKey,
  getModels,
  getProviders,
  type Model,
} from "@mariozechner/pi-ai";
import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  Input,
  type SelectItem,
  SelectList,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import { ModalFrame } from "./modal-frame.js";

export interface ModelSelectorOptions {
  currentModel: Model<Api>;
  onSelect: (model: Model<Api>) => void;
  onCancel: () => void;
  hasCredentials?: (provider: string) => boolean;
}

/**
 * Pi-style model selector with a filter input + a scrollable list.
 */
export class ModelSelectorComponent implements Component, Focusable {
  focused = false;

  private filterInput = new Input();
  private selectList: SelectList;
  private modelByKey = new Map<string, Model<Api>>();
  private frame = new ModalFrame({
    title: "Select model",
    hint: "type to filter • ↑↓ navigate • Enter select • Esc cancel",
  });

  constructor(options: ModelSelectorOptions) {
    const items: SelectItem[] = [];

    for (const provider of getProviders()) {
      for (const model of getModels(provider)) {
        const key = `${model.provider}/${model.id}`;
        this.modelByKey.set(key, model);

        const hasKey =
          options.hasCredentials?.(model.provider) ??
          Boolean(getEnvApiKey(model.provider));
        const keyHint = hasKey ? "" : " (no key)";

        items.push({
          value: key,
          label: key,
          description: `${model.api}${keyHint}`,
        });
      }
    }

    this.selectList = new SelectList(items, 12, tuiTheme.selectList);

    this.selectList.onSelect = (item) => {
      const model = this.modelByKey.get(item.value);
      if (model) {
        options.onSelect(model);
      }
    };

    this.selectList.onCancel = () => {
      options.onCancel();
    };

    // Default selection to current model if present.
    const currentKey = `${options.currentModel.provider}/${options.currentModel.id}`;
    const currentIndex = items.findIndex((i) => i.value === currentKey);
    if (currentIndex >= 0) {
      this.selectList.setSelectedIndex(currentIndex);
    }

    this.filterInput.setValue("");
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    // Let the list handle navigation/confirm/cancel.
    if (
      kb.matches(data, "selectUp") ||
      kb.matches(data, "selectDown") ||
      kb.matches(data, "selectConfirm") ||
      kb.matches(data, "selectCancel")
    ) {
      this.selectList.handleInput(data);
      return;
    }

    // Otherwise treat it as filter input.
    const before = this.filterInput.getValue();
    this.filterInput.handleInput(data);
    const after = this.filterInput.getValue();

    if (after !== before) {
      this.selectList.setFilter(after);
    }
  }

  render(width: number): string[] {
    // Propagate focus to the filter input so cursor marker is emitted.
    this.filterInput.focused = this.focused;

    const filterLine = this.filterInput.render(width).map((l) => `  ${l}`);
    const body = [...filterLine, "", ...this.selectList.render(width)];

    return this.frame.render(width, body);
  }

  invalidate(): void {
    this.filterInput.invalidate();
    this.selectList.invalidate();
  }
}
