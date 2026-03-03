import type { ChannelType, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ChannelType as CT } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "../shared/ui-catalog-prompt";
import { uiCatalogProvider } from "./ui-catalog";

const runtime = {} as IAgentRuntime;
const state = {} as State;

function makeMessage(channelType?: ChannelType): Memory {
  return { content: { channelType } } as Memory;
}

describe("uiCatalogProvider", () => {
  it("has name 'uiCatalog'", () => {
    expect(uiCatalogProvider.name).toBe("uiCatalog");
  });

  it("DM channel returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.DM),
      state,
    );
    expect(result.text).toContain("Available UI Components:");
  });

  it("API channel returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.API),
      state,
    );
    expect(result.text).toContain("Available UI Components:");
  });

  it("missing channelType returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(undefined),
      state,
    );
    expect(result.text).toContain("Available UI Components:");
  });

  it("GROUP channel returns empty text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.GROUP),
      state,
    );
    expect(result.text).toBe("");
  });

  it("catalog text contains component names from COMPONENT_CATALOG", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.DM),
      state,
    );
    for (const name of Object.keys(COMPONENT_CATALOG)) {
      expect(result.text).toContain(name);
    }
  });
});
