import type { ChannelType, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ChannelType as CT } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "../shared/ui-catalog-prompt";
import { uiCatalogProvider } from "./ui-catalog";

const runtime = {} as IAgentRuntime;
const state = {} as State;

function makeMessage(channelType?: ChannelType): Memory {
  return { content: { channelType } } as unknown as Memory;
}

describe("uiCatalogProvider", () => {
  function expectRichUiCatalog(text: string) {
    expect(text).toContain("## Rich UI Output");
    expect(text).toContain("### Method 1");
    expect(text).toContain("### Method 2");
    expect(text).toContain("### Available components");
  }

  it("has name 'uiCatalog'", () => {
    expect(uiCatalogProvider.name).toBe("uiCatalog");
  });

  it("DM channel returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.DM),
      state,
    );
    expectRichUiCatalog(result.text);
  });

  it("API channel returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(CT.API),
      state,
    );
    expectRichUiCatalog(result.text);
  });

  it("missing channelType returns catalog text", async () => {
    const result = await uiCatalogProvider.get(
      runtime,
      makeMessage(undefined),
      state,
    );
    expectRichUiCatalog(result.text);
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
