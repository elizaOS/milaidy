import { describe, expect, it } from "vitest";
import { parseJejuSwapFromUserText } from "./swap-parse.js";

describe("parseJejuSwapFromUserText", () => {
  it("parses swap 0.1 ETH for USDC (chat-style)", () => {
    const r = parseJejuSwapFromUserText(
      "Can you swap 0.1 ETH for some USDC on Jeju?",
    );
    expect(r.direction).toBe("eth_to_usdc");
    expect(r.amount).toBe("0.1");
  });

  it("parses USDC to ETH", () => {
    const r = parseJejuSwapFromUserText("swap 100 usdc for eth on jeju");
    expect(r.direction).toBe("usdc_to_eth");
    expect(r.amount).toBe("100");
  });

  it("uses weth like eth for amount", () => {
    const r = parseJejuSwapFromUserText("swap 2 weth to usdc");
    expect(r.direction).toBe("eth_to_usdc");
    expect(r.amount).toBe("2");
  });

  it("returns empty for empty text", () => {
    expect(parseJejuSwapFromUserText("")).toEqual({});
  });
});
