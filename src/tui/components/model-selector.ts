import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  Input,
  type SelectItem,
  SelectList,
} from "@elizaos/tui";
import chalk from "chalk";
import { tuiTheme } from "../theme";

/** Minimal model type (TUI disabled). */
export interface TuiModel {
  id: string;
  provider: string;
  api: string;
}

export interface ModelSelectorOptions {
  currentModel: TuiModel;
  onSelect: (model: TuiModel) => void;
  onCancel: () => void;
  hasCredentials?: (provider: string) => boolean;
}

/**
 * Model selector (TUI disabled, shows empty list).
 */
export class ModelSelectorComponent implements Component, Focusable {
  focused = false;

  private filterInput = new Input();
  private selectList: SelectList;
  private modelByKey = new Map<string, TuiModel>();

  constructor(options: ModelSelectorOptions) {
    const items: SelectItem[] = [];
    // No models
    this.modelByKey = new Map();
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

    this.filterInput.setValue("");
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
      return;
    }

    const before = this.filterInput.getValue();
    this.filterInput.handleInput(data);
    const after = this.filterInput.getValue();

    if (after !== before) {
      this.selectList.setFilter(after);
    }
  }

  render(width: number): string[] {
    this.filterInput.focused = this.focused;

    const header = [chalk.bold(" Select model"), chalk.dim(" (no models)"), ""];

    const filterLine = this.filterInput.render(width).map((l) => `  ${l}`);

    return [...header, ...filterLine, "", ...this.selectList.render(width)];
  }

  invalidate(): void {
    this.filterInput.invalidate();
    this.selectList.invalidate();
  }
}
