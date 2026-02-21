import type { Input } from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import type { PluginParam } from "./plugins-installed-tab-types.js";

function formatSettingValue(
  value: string,
  showUnmaskedValues: boolean,
): string {
  if (value === "") {
    return tuiTheme.dim("(empty)");
  }
  if (showUnmaskedValues) {
    return value;
  }
  return tuiTheme.muted("•".repeat(Math.max(8, Math.min(24, value.length))));
}

export function renderEditSelectView(params: {
  editingPluginName: string;
  editingKeys: string[];
  editingIndex: number;
  editingDraft: Record<string, string>;
  editingParamsByKey: Record<string, PluginParam>;
  showUnmaskedValues: boolean;
}): string[] {
  const {
    editingPluginName,
    editingKeys,
    editingIndex,
    editingDraft,
    editingParamsByKey,
    showUnmaskedValues,
  } = params;
  const lines: string[] = [];
  lines.push(`  ${tuiTheme.accent("Edit Plugin Settings")}`);
  lines.push(`  ${tuiTheme.dim(editingPluginName)}`);
  lines.push("");

  if (editingKeys.length === 0) {
    lines.push(tuiTheme.dim("  No settings yet. Press 'a' to add one."));
    lines.push("");
    lines.push(tuiTheme.dim("  a add setting • s save • Esc cancel"));
    return lines;
  }

  const labels = editingKeys.map((key) => {
    const param = editingParamsByKey[key];
    const requiredBadge = param?.required ? " *" : "";
    return `${param?.label ?? key}${requiredBadge}`;
  });
  const maxLabelWidth = Math.max(...labels.map((label) => label.length));

  editingKeys.forEach((key, idx) => {
    const selected = idx === editingIndex;
    const value = editingDraft[key] ?? "";
    const cursor = selected ? tuiTheme.accent("→") : " ";
    const baseLabel = labels[idx] ?? key;
    const label = baseLabel.padEnd(maxLabelWidth);
    const renderedValue = formatSettingValue(value, showUnmaskedValues);
    const line = `${cursor} ${selected ? tuiTheme.accent(label) : label}  ${renderedValue}`;
    lines.push(`  ${line}`);
  });

  lines.push("");
  lines.push(tuiTheme.dim("  * required"));
  lines.push(
    tuiTheme.dim(
      `  ↑↓ select setting • Enter edit value • a add • s save • Ctrl+U ${showUnmaskedValues ? "mask" : "unmask"} • Esc cancel`,
    ),
  );
  return lines;
}

export function renderAddKeyView(params: {
  width: number;
  focused: boolean;
  editingPluginName: string;
  newKeyInput: Input;
}): string[] {
  const { width, focused, editingPluginName, newKeyInput } = params;
  newKeyInput.focused = focused;
  return [
    `  ${tuiTheme.accent("Add Setting Key")}`,
    `  ${tuiTheme.dim(editingPluginName)}`,
    "",
    ...newKeyInput.render(width).map((line) => `  ${line}`),
    "",
    tuiTheme.dim("  Enter continue • Esc back"),
  ];
}

export function renderEditValueView(params: {
  width: number;
  focused: boolean;
  editingPluginName: string;
  editingKeys: string[];
  editingIndex: number;
  showUnmaskedValues: boolean;
  valueInput: Input;
}): string[] {
  const {
    width,
    focused,
    editingPluginName,
    editingKeys,
    editingIndex,
    showUnmaskedValues,
    valueInput,
  } = params;

  const key = editingKeys[editingIndex] ?? "";
  valueInput.focused = focused;

  const valueLines = showUnmaskedValues
    ? valueInput.render(width).map((line) => `  ${line}`)
    : [
        `  ${tuiTheme.accent("→")} ${tuiTheme.muted("•".repeat(valueInput.getValue().length))}`,
      ];

  return [
    `  ${tuiTheme.accent("Edit Value")}`,
    `  ${tuiTheme.dim(`${editingPluginName} • ${key}`)}`,
    "",
    ...valueLines,
    "",
    tuiTheme.dim(
      `  Enter apply • Ctrl+U ${showUnmaskedValues ? "mask" : "unmask"} • Esc back`,
    ),
  ];
}
