/**
 * ANSI/terminal utility functions for processing PTY output.
 *
 * Pure functions — no state, no dependencies beyond the standard library.
 *
 * @module services/ansi-utils
 */

// ANSI escape sequence patterns for terminal output stripping.
// These intentionally match control characters (\x1b, \x00-\x1f, \x7f).
/* eslint-disable no-control-regex */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const CURSOR_MOVEMENT = /\x1b\[\d*[CDABGdEF]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const CURSOR_POSITION = /\x1b\[\d*(?:;\d+)?[Hf]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const ERASE = /\x1b\[\d*[JK]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const ALL_ANSI = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires control chars
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const LONG_SPACES = / {3,}/g;

/** Apply all ANSI stripping patterns to a string */
function applyAnsiStrip(input: string): string {
  return input
    .replace(CURSOR_MOVEMENT, " ")
    .replace(CURSOR_POSITION, " ")
    .replace(ERASE, "")
    .replace(OSC, "")
    .replace(ALL_ANSI, "")
    .replace(CONTROL_CHARS, "")
    .replace(LONG_SPACES, " ")
    .trim();
}

/**
 * Strip ANSI escape sequences from raw terminal output for readable text.
 * Replaces cursor-forward codes with spaces (TUI uses these instead of actual spaces).
 */
export function stripAnsi(raw: string): string {
  return applyAnsiStrip(raw);
}

/**
 * Capture the agent's output since the last task was sent, stripped of ANSI codes.
 * Returns the raw response text, or empty string if no marker exists.
 *
 * Mutates `markers` by deleting the entry for `sessionId` after capture.
 */
export function captureTaskResponse(
  sessionId: string,
  buffers: Map<string, string[]>,
  markers: Map<string, number>,
): string {
  const buffer = buffers.get(sessionId);
  const marker = markers.get(sessionId);
  if (!buffer || marker === undefined) return "";

  const responseLines = buffer.slice(marker);
  markers.delete(sessionId);

  return applyAnsiStrip(responseLines.join("\n"));
}
