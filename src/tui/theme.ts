import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";

// ─── Milady brand palette (TUI-specific) ────────────────────────────
// NOTE: These are intentionally separate from the CLI palette.
const ACCENT = "#E879F9"; // fuchsia-400
const ACCENT_DIM = "#A855F7"; // violet-500
const MUTED = "#808080"; // gray
const DIM = "#666666"; // dim gray
const SUCCESS = "#b5bd68"; // green
const ERROR = "#cc6666"; // red
const WARNING = "#FBBF24"; // amber
const INFO = "#60A5FA"; // blue

// Background colors (dark, subtle tints)
const USER_MSG_BG = "#2D1B3D"; // dark purple tint
const TOOL_PENDING_BG = "#282832"; // dark blue-gray
const TOOL_SUCCESS_BG = "#283228"; // dark green tint
const TOOL_ERROR_BG = "#3c2828"; // dark red tint

// Markdown
const MD_HEADING = "#f0c674"; // warm yellow
const MD_LINK = "#81a2be"; // muted blue
const MD_CODE = ACCENT;
const MD_CODE_BLOCK = SUCCESS;

// Syntax highlighting colors
const SYN_COMMENT = "#6A9955"; // green-gray
const SYN_KEYWORD = "#C586C0"; // magenta/purple
const SYN_FUNCTION = "#DCDCAA"; // warm yellow
const SYN_VARIABLE = "#9CDCFE"; // light blue
const SYN_STRING = "#CE9178"; // warm orange
const SYN_NUMBER = "#B5CEA8"; // soft green
const SYN_TYPE = "#4EC9B0"; // teal
const SYN_OPERATOR = "#D4D4D4"; // light gray
const SYN_PUNCTUATION = "#808080"; // gray

const hex = (value: string) => chalk.hex(value);
const bg = (value: string) => chalk.bgHex(value);

/** cli-highlight theme mapped to Milady's palette. */
const cliHighlightTheme: Record<string, (s: string) => string> = {
  keyword: (s) => hex(SYN_KEYWORD)(s),
  built_in: (s) => hex(SYN_TYPE)(s),
  literal: (s) => hex(SYN_NUMBER)(s),
  number: (s) => hex(SYN_NUMBER)(s),
  string: (s) => hex(SYN_STRING)(s),
  comment: (s) => hex(SYN_COMMENT)(s),
  function: (s) => hex(SYN_FUNCTION)(s),
  title: (s) => hex(SYN_FUNCTION)(s),
  class: (s) => hex(SYN_TYPE)(s),
  type: (s) => hex(SYN_TYPE)(s),
  attr: (s) => hex(SYN_VARIABLE)(s),
  variable: (s) => hex(SYN_VARIABLE)(s),
  params: (s) => hex(SYN_VARIABLE)(s),
  operator: (s) => hex(SYN_OPERATOR)(s),
  punctuation: (s) => hex(SYN_PUNCTUATION)(s),
};

export const miladySelectListTheme: SelectListTheme = {
  selectedPrefix: (text) => hex(ACCENT)(text),
  selectedText: (text) => chalk.bold(hex(ACCENT)(text)),
  description: (text) => hex(MUTED)(text),
  scrollInfo: (text) => hex(MUTED)(text),
  noMatch: (text) => hex(MUTED)(text),
};

export const miladyEditorTheme: EditorTheme = {
  borderColor: (text) => hex(DIM)(text),
  selectList: miladySelectListTheme,
};

export const miladyMarkdownTheme: MarkdownTheme = {
  heading: (text) => chalk.bold(hex(MD_HEADING)(text)),
  link: (text) => hex(MD_LINK)(text),
  linkUrl: (text) => hex(DIM)(text),
  code: (text) => hex(MD_CODE)(text),
  codeBlock: (text) => hex(MD_CODE_BLOCK)(text),
  codeBlockBorder: (text) => hex(MUTED)(text),
  quote: (text) => hex(MUTED)(text),
  quoteBorder: (text) => hex(MUTED)(text),
  hr: (text) => hex(MUTED)(text),
  listBullet: (text) => hex(ACCENT_DIM)(text),
  bold: (text) => chalk.bold(text),
  italic: (text) => chalk.italic(hex(ACCENT_DIM)(text)),
  strikethrough: (text) => chalk.strikethrough(text),
  underline: (text) => chalk.underline(text),
  highlightCode: (code: string, lang?: string): string[] => {
    const validLang = lang && supportsLanguage(lang) ? lang : undefined;
    try {
      return highlight(code, {
        language: validLang,
        ignoreIllegals: true,
        theme: cliHighlightTheme,
      }).split("\n");
    } catch {
      return code.split("\n").map((line) => hex(MD_CODE_BLOCK)(line));
    }
  },
};

export const tuiTheme = {
  // Foreground helpers
  accent: (text: string) => hex(ACCENT)(text),
  accentDim: (text: string) => hex(ACCENT_DIM)(text),
  muted: (text: string) => hex(MUTED)(text),
  dim: (text: string) => hex(DIM)(text),
  success: (text: string) => hex(SUCCESS)(text),
  error: (text: string) => hex(ERROR)(text),
  warning: (text: string) => hex(WARNING)(text),
  info: (text: string) => hex(INFO)(text),

  bold: (text: string) => chalk.bold(text),
  italic: (text: string) => chalk.italic(text),

  // Background helpers
  userMsgBg: (text: string) => bg(USER_MSG_BG)(text),
  toolPendingBg: (text: string) => bg(TOOL_PENDING_BG)(text),
  toolSuccessBg: (text: string) => bg(TOOL_SUCCESS_BG)(text),
  toolErrorBg: (text: string) => bg(TOOL_ERROR_BG)(text),

  // Component themes
  markdown: miladyMarkdownTheme,
  editor: miladyEditorTheme,
  selectList: miladySelectListTheme,
} as const;
