import { complete } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PI_MODEL_SPEC,
  getPiModel,
  parseModelSpec,
} from "../utils/pi-ai.js";

// Requires a real provider API key.
// Run with: MILAIDY_LIVE_TEST=1 pnpm test:live (or equivalent)

describe("pi-ai integration", () => {
  it.skipIf(!process.env.ANTHROPIC_API_KEY)(
    "can complete a simple prompt",
    async () => {
      const { provider, id } = parseModelSpec(DEFAULT_PI_MODEL_SPEC);
      const model = getPiModel(provider, id);

      const result = await complete(model, {
        systemPrompt: "You are helpful.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Say hello in 3 words." }],
            timestamp: Date.now(),
          },
        ],
      });

      const text = result.content.find((c) => c.type === "text")?.text ?? "";
      expect(text.length).toBeGreaterThan(0);
    },
  );
});
