import path from "node:path";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface TitlebarSpinnerOptions {
  setTitle: (title: string) => void;
  intervalMs?: number;
}

/**
 * Lightweight titlebar spinner used by the Milady TUI while a request is in
 * flight.
 */
export class TitlebarSpinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private baseTitle = getDefaultTitle();

  constructor(private readonly options: TitlebarSpinnerOptions) {}

  setBaseTitle(title: string): void {
    this.baseTitle = title.trim() || getDefaultTitle();
    if (!this.timer) {
      this.applyTitle(this.baseTitle);
    }
  }

  start(): void {
    this.stop();

    const intervalMs = this.options.intervalMs ?? 80;
    this.timer = setInterval(() => {
      const frame =
        BRAILLE_FRAMES[this.frameIndex % BRAILLE_FRAMES.length] ?? "⠋";
      this.applyTitle(`${frame} ${this.baseTitle}`);
      this.frameIndex += 1;
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.frameIndex = 0;
    this.applyTitle(this.baseTitle);
  }

  dispose(): void {
    this.stop();
  }

  private applyTitle(title: string): void {
    try {
      this.options.setTitle(title);
    } catch {
      // Ignore terminal title errors for non-standard terminals.
    }
  }
}

export function getDefaultTitle(): string {
  const cwd = path.basename(process.cwd());
  return `milady - ${cwd}`;
}
