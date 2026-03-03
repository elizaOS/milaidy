/**
 * Animated loading screen displayed during Milady TUI boot.
 *
 * Renders in the terminal's alternate screen buffer before the main
 * TUI takes over. Shows the agent name with sparkle animation, a
 * progress bar, and a spinner with the current boot phase label.
 *
 * @module loading-screen
 */
import chalk from "chalk";

// ── Milady brand palette (matches src/tui/theme.ts) ─────────────────
const ACCENT = "#E879F9"; // fuchsia-400
const ACCENT_DIM = "#A855F7"; // violet-500
const MUTED = "#808080"; // gray
const DIM = "#666666"; // dim gray
const SUCCESS = "#b5bd68"; // green

// ── Animation frames ─────────────────────────────────────────────────
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPARKLE_FRAMES = ["✦", "✧", "✦", "⋆", "✧", "⋆", "·", "✧"];
const HEART_FRAMES = ["♡", "♥", "♡", "♥"];

// ── ANSI helpers ─────────────────────────────────────────────────────
const ESC = "\x1b";
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;

/** Strip ANSI escape sequences for measuring visible width. */
function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes requires matching control chars
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Center a string within the given column width. */
function center(s: string, cols: number): string {
  const visLen = stripAnsi(s).length;
  const pad = Math.max(0, Math.floor((cols - visLen) / 2));
  return " ".repeat(pad) + s;
}

/**
 * Standalone loading screen for the Milady TUI boot sequence.
 *
 * Usage:
 * ```ts
 * const screen = new LoadingScreen("Luna");
 * screen.start();
 * screen.update(0.3, "Resolving plugins");
 * // ... later ...
 * screen.stop();
 * ```
 */
export class LoadingScreen {
  private intervalId: NodeJS.Timeout | null = null;
  private frame = 0;
  private currentLabel = "Starting up…";
  private currentProgress = 0;
  private agentName: string;
  private detail?: string;

  constructor(agentName?: string) {
    this.agentName = agentName ?? "Milady";
  }

  /** Enter alternate screen and begin animation loop. */
  start(): void {
    process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);
    this.render();
    this.intervalId = setInterval(() => {
      this.frame++;
      this.render();
    }, 80);
  }

  /** Update the displayed progress. */
  update(progress: number, label: string, detail?: string): void {
    this.currentProgress = Math.min(1, Math.max(0, progress));
    this.currentLabel = label;
    this.detail = detail;
  }

  /** Stop animation, leave alternate screen, show cursor. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    process.stdout.write(ALT_SCREEN_OFF + CURSOR_SHOW);
  }

  private render(): void {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;

    // Clear and position
    process.stdout.write(CLEAR_SCREEN);

    const centerY = Math.max(1, Math.floor(rows / 2) - 5);

    // ── Agent name with sparkles ──────────────────────────────────
    const heartIdx = this.frame % HEART_FRAMES.length;
    const heart = chalk.hex(ACCENT)(HEART_FRAMES[heartIdx]);
    const nameText = chalk.bold.hex(ACCENT)(
      ` ${heart} ${this.agentName} ${heart} `,
    );

    const sparkleL = SPARKLE_FRAMES[(this.frame + 0) % SPARKLE_FRAMES.length];
    const sparkleR = SPARKLE_FRAMES[(this.frame + 3) % SPARKLE_FRAMES.length];
    const sl = chalk.hex(ACCENT_DIM)(sparkleL);
    const sr = chalk.hex(ACCENT_DIM)(sparkleR);

    const nameLine = `${sl}  ${nameText}  ${sr}`;

    // ── Subtitle ──────────────────────────────────────────────────
    const subtitle = chalk.hex(DIM)("powered by ElizaOS");

    // ── Progress bar ──────────────────────────────────────────────
    const barWidth = Math.min(40, Math.max(20, cols - 20));
    const filled = Math.round(this.currentProgress * barWidth);
    const empty = barWidth - filled;

    // Gradient-ish effect: last filled char is slightly dimmer
    let filledStr: string;
    if (filled > 1) {
      filledStr =
        chalk.hex(ACCENT)("█".repeat(filled - 1)) + chalk.hex(ACCENT_DIM)("█");
    } else if (filled === 1) {
      filledStr = chalk.hex(ACCENT_DIM)("█");
    } else {
      filledStr = "";
    }
    const emptyStr = chalk.hex(DIM)("░".repeat(empty));

    const pctValue = Math.round(this.currentProgress * 100);
    const pctColor = pctValue >= 100 ? SUCCESS : MUTED;
    const pct = chalk.hex(pctColor)(` ${pctValue}%`);
    const bar = `${filledStr}${emptyStr}${pct}`;

    // ── Spinner + status ──────────────────────────────────────────
    const spinnerIdx = this.frame % SPINNER_FRAMES.length;
    const spinner = chalk.hex(ACCENT)(SPINNER_FRAMES[spinnerIdx]);
    const statusLabel =
      this.currentProgress >= 1
        ? chalk.hex(SUCCESS)(this.currentLabel)
        : chalk.hex(MUTED)(this.currentLabel);
    const status = `${spinner} ${statusLabel}`;

    // ── Detail line (optional) ────────────────────────────────────
    const detailLine = this.detail ? chalk.hex(DIM)(`  ${this.detail}`) : "";

    // ── Decorative dots that animate ──────────────────────────────
    const dotPatterns = ["· · ·", " · · ", "· · ·", "  ·  "];
    const dots = chalk.hex(DIM)(
      dotPatterns[Math.floor(this.frame / 3) % dotPatterns.length],
    );

    // ── Compose output ────────────────────────────────────────────
    const lines = [
      "",
      center(dots, cols),
      "",
      center(nameLine, cols),
      center(subtitle, cols),
      "",
      center(bar, cols),
      "",
      center(status, cols),
      detailLine ? center(detailLine, cols) : "",
      "",
      center(dots, cols),
    ].filter((line) => line !== undefined);

    process.stdout.write(`${ESC}[${centerY};1H`);
    process.stdout.write(lines.join("\n"));
  }
}
