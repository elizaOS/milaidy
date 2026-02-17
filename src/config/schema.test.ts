import { describe, expect, it } from "vitest";
import { buildConfigSchema } from "./schema";

describe("config schema", () => {
  it("exports schema + hints", () => {
    const res = buildConfigSchema();
    const schema = res.schema as { properties?: Record<string, unknown> };
    expect(schema.properties?.gateway).toBeTruthy();
    expect(schema.properties?.agents).toBeTruthy();
    expect(res.uiHints.gateway?.label).toBe("Gateway");
    expect(res.uiHints["gateway.auth.token"]?.sensitive).toBe(true);
    expect(res.version).toBeTruthy();
    expect(res.generatedAt).toBeTruthy();
  });

  it("merges plugin ui hints", () => {
    const res = buildConfigSchema({
      plugins: [
        {
          id: "voice-call",
          name: "Voice Call",
          description: "Outbound voice calls",
          configUiHints: {
            provider: { label: "Provider" },
            "twilio.authToken": { label: "Auth Token", sensitive: true },
          },
        },
      ],
    });

    expect(res.uiHints["plugins.entries.voice-call"]?.label).toBe("Voice Call");
    expect(res.uiHints["plugins.entries.voice-call.config"]?.label).toBe(
      "Voice Call Config",
    );
    expect(
      res.uiHints["plugins.entries.voice-call.config.twilio.authToken"]?.label,
    ).toBe("Auth Token");
    expect(
      res.uiHints["plugins.entries.voice-call.config.twilio.authToken"]
        ?.sensitive,
    ).toBe(true);
  });

  it("merges plugin + connector schemas", () => {
    const res = buildConfigSchema({
      plugins: [
        {
          id: "voice-call",
          name: "Voice Call",
          configSchema: {
            type: "object",
            properties: {
              provider: { type: "string" },
            },
          },
        },
      ],
      connectors: [
        {
          id: "matrix",
          label: "Matrix",
          configSchema: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
            },
          },
        },
      ],
    });

    const schema = res.schema as {
      properties?: Record<string, unknown>;
    };
    const pluginsNode = schema.properties?.plugins as
      | Record<string, unknown>
      | undefined;
    const entriesNode = pluginsNode?.properties as
      | Record<string, unknown>
      | undefined;
    const entriesProps = entriesNode?.entries as
      | Record<string, unknown>
      | undefined;
    const entryProps = entriesProps?.properties as
      | Record<string, unknown>
      | undefined;
    const pluginEntry = entryProps?.["voice-call"] as
      | Record<string, unknown>
      | undefined;
    const pluginConfig = pluginEntry?.properties as
      | Record<string, unknown>
      | undefined;
    const pluginConfigSchema = pluginConfig?.config as
      | Record<string, unknown>
      | undefined;
    const pluginConfigProps = pluginConfigSchema?.properties as
      | Record<string, unknown>
      | undefined;
    expect(pluginConfigProps?.provider).toBeTruthy();

    const connectorsNode = schema.properties?.connectors as
      | Record<string, unknown>
      | undefined;
    const connectorsProps = connectorsNode?.properties as
      | Record<string, unknown>
      | undefined;
    const connectorSchema = connectorsProps?.matrix as
      | Record<string, unknown>
      | undefined;
    const connectorProps = connectorSchema?.properties as
      | Record<string, unknown>
      | undefined;
    expect(connectorProps?.accessToken).toBeTruthy();
  });

  it("adds heartbeat target hints with dynamic connectors", () => {
    const res = buildConfigSchema({
      connectors: [
        {
          id: "bluebubbles",
          label: "BlueBubbles",
          configSchema: { type: "object" },
        },
      ],
    });

    const defaultsHint = res.uiHints["agents.defaults.heartbeat.target"];
    const listHint = res.uiHints["agents.list.*.heartbeat.target"];
    expect(defaultsHint?.help).toContain("bluebubbles");
    expect(defaultsHint?.help).toContain("last");
    expect(listHint?.help).toContain("bluebubbles");
  });
});
