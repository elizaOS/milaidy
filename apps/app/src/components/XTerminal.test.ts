import { describe, expect, it } from "vitest";
import { CLEAR_SCROLLBACK_RE } from "./XTerminal";

describe("CLEAR_SCROLLBACK_RE", () => {
  it("strips a single \\e[3J sequence", () => {
    const input = "hello\x1b[3Jworld";
    expect(input.replace(CLEAR_SCROLLBACK_RE, "")).toBe("helloworld");
  });

  it("strips multiple \\e[3J sequences", () => {
    const input = "\x1b[3Jline1\x1b[3Jline2\x1b[3J";
    expect(input.replace(CLEAR_SCROLLBACK_RE, "")).toBe("line1line2");
  });

  it("returns input unchanged when no \\e[3J is present", () => {
    const input = "normal terminal output\x1b[2J\x1b[H";
    expect(input.replace(CLEAR_SCROLLBACK_RE, "")).toBe(input);
  });

  it("handles empty string", () => {
    expect("".replace(CLEAR_SCROLLBACK_RE, "")).toBe("");
  });

  it("does not strip partial sequences like \\e[3 or \\e[3K", () => {
    const input = "\x1b[3 \x1b[3K\x1b[3;1H";
    expect(input.replace(CLEAR_SCROLLBACK_RE, "")).toBe(input);
  });
});
