import { tuiTheme } from "../theme.js";

export interface ModalHeaderOptions {
  title: string;
  hint?: string;
  spacerAfterHeader?: boolean;
}

/**
 * Shared modal header chrome so popup overlays feel consistent.
 */
export function renderModalHeader(options: ModalHeaderOptions): string[] {
  const lines = [tuiTheme.bold(` ${options.title}`)];

  if (options.hint) {
    lines.push(tuiTheme.dim(` ${options.hint}`));
  }

  if (options.spacerAfterHeader !== false) {
    lines.push("");
  }

  return lines;
}
