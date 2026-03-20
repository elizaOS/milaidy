import signalPlugin, {
  signalPlugin as namedSignalPlugin,
} from "@elizaos/plugin-signal";
import { describe, expect, it } from "vitest";

describe("signal plugin service (public contract)", () => {
  it("exports a stable plugin root object", () => {
    expect(signalPlugin.name).toBe("signal");
    expect(signalPlugin).toBe(namedSignalPlugin ?? signalPlugin);
    expect(typeof signalPlugin.description).toBe("string");
    expect(typeof signalPlugin.init).toBe("function");
  });

  it("exposes at least one service constructor", () => {
    const services = signalPlugin.services ?? [];
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);

    for (const service of services) {
      expect(typeof service).toBe("function");
    }
  });

  it("keeps providers array shape valid when present", () => {
    const providers = signalPlugin.providers ?? [];
    expect(Array.isArray(providers)).toBe(true);

    for (const provider of providers) {
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.get).toBe("function");
    }
  });
});
