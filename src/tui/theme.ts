import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@elizaos/tui";
import chalk from "chalk";

// Milady brand colors (TUI-specific).
// NOTE: These are intentionally separate from the CLI palette.
const ACCENT = "#E879F9";
const ACCENT_DIM = "#A855F7";
const MUTED = "#6B7280";
const SUCCESS = "#34D399";
const ERROR = "#F87171";
const WARNING = "#FBBF24";
const INFO = "#60A5FA";

const hex = (value: string) => chalk.hex(value);

export const miladySelectListTheme: SelectListTheme = {
  selectedPrefix: (text) => hex(ACCENT)(text),
  selectedText: (text) => chalk.bold(hex(ACCENT)(text)),
  description: (text) => hex(MUTED)(text),
  scrollInfo: (text) => hex(MUTED)(text),
  noMatch: (text) => hex(MUTED)(text),
};

export const miladyEditorTheme: EditorTheme = {
  borderColor: (text) => hex(ACCENT_DIM)(text),
  selectList: miladySelectListTheme,
};

export const miladyMarkdownTheme: MarkdownTheme = {
  heading: (text) => chalk.bold(hex(ACCENT)(text)),
  link: (text) => hex(INFO)(text),
  linkUrl: (text) => hex(MUTED)(text),
  code: (text) => hex(INFO)(text),
  codeBlock: (text) => hex("#D1D5DB")(text),
  codeBlockBorder: (text) => hex(MUTED)(text),
  quote: (text) => hex(MUTED)(text),
  quoteBorder: (text) => hex(MUTED)(text),
  hr: (text) => hex(MUTED)(text),
  listBullet: (text) => hex(ACCENT_DIM)(text),
  bold: (text) => chalk.bold(text),
  italic: (text) => chalk.italic(hex(ACCENT_DIM)(text)),
  strikethrough: (text) => chalk.strikethrough(text),
  underline: (text) => chalk.underline(text),
};

export const tuiTheme = {
  accent: (text: string) => hex(ACCENT)(text),
  muted: (text: string) => hex(MUTED)(text),
  success: (text: string) => hex(SUCCESS)(text),
  error: (text: string) => hex(ERROR)(text),
  warning: (text: string) => hex(WARNING)(text),
  info: (text: string) => hex(INFO)(text),

  markdown: miladyMarkdownTheme,
  editor: miladyEditorTheme,
  selectList: miladySelectListTheme,
} as const;
