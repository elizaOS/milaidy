import { describe, expect, it } from "vitest";

import {
  categorize,
  resolveSetupGuideUrl,
  STREAMING_DESTINATIONS,
} from "./generate-plugin-index.js";

describe("generate-plugin-index", () => {
  it("classifies all streaming destinations as streaming", () => {
    for (const id of STREAMING_DESTINATIONS) {
      expect(categorize(id)).toBe("streaming");
    }
  });

  it("maps curated setup-guide URLs for streaming plugins", () => {
    expect(resolveSetupGuideUrl("retake")).toBe(
      "https://docs.milady.ai/plugin-setup-guide#retaketv",
    );
    expect(resolveSetupGuideUrl("x-streaming")).toBe(
      "https://docs.milady.ai/plugin-setup-guide#x-streaming",
    );
    expect(resolveSetupGuideUrl("pumpfun-streaming")).toBe(
      "https://docs.milady.ai/plugin-setup-guide#pumpfun-streaming",
    );
  });
});
