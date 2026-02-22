import { describe, it, expect, beforeEach, vi } from "vitest";
import { installChromeMock, type ChromeMock } from "./chrome-mock";

/* ------------------------------------------------------------------ */
/*  Minimal DOM stubs                                                  */
/* ------------------------------------------------------------------ */

type FakeElement = {
  value: string;
  textContent: string;
  dataset: Record<string, string>;
  addEventListener: ReturnType<typeof vi.fn>;
};

function makeFakeElement(initial: Partial<FakeElement> = {}): FakeElement {
  return {
    value: initial.value ?? "",
    textContent: initial.textContent ?? "",
    dataset: initial.dataset ?? {},
    addEventListener: vi.fn(),
  };
}

let elements: Record<string, FakeElement>;
let chromeMock: ChromeMock;

beforeEach(() => {
  vi.resetModules();
  chromeMock = installChromeMock();

  elements = {
    "relay-url": makeFakeElement(),
    status: makeFakeElement(),
    port: makeFakeElement({ value: "18792" }),
    save: makeFakeElement(),
  };

  (globalThis as any).document = {
    getElementById: vi.fn((id: string) => elements[id] ?? null),
  };

  // Default fetch: relay reachable
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200 }));
  (globalThis as any).AbortController = class {
    signal = {};
    abort() {}
  };
});

/* ------------------------------------------------------------------ */
/*  Dynamic import helper — reimport module per test to avoid          */
/*  side-effect caching from the top-level `load()` call.             */
/* ------------------------------------------------------------------ */

async function importOptions() {
  // Each call gets a fresh module instance
  const mod = await import("../options.js");
  return mod;
}

/* ------------------------------------------------------------------ */
/*  clampPort                                                          */
/* ------------------------------------------------------------------ */

describe("clampPort", () => {
  // Import once for pure-function tests (no side effects needed)
  let clampPort: (v: unknown) => number;
  beforeEach(async () => {
    ({ clampPort } = await importOptions());
  });

  it("returns valid port unchanged", () => {
    expect(clampPort(8080)).toBe(8080);
  });

  it("returns default for empty/undefined", () => {
    expect(clampPort("")).toBe(18792);
    expect(clampPort(undefined)).toBe(18792);
  });

  it("returns default for zero or negative", () => {
    expect(clampPort(0)).toBe(18792);
    expect(clampPort(-1)).toBe(18792);
  });

  it("returns default for port > 65535", () => {
    expect(clampPort(70000)).toBe(18792);
  });

  it("returns default for NaN", () => {
    expect(clampPort("abc")).toBe(18792);
  });
});

/* ------------------------------------------------------------------ */
/*  updateRelayUrl                                                     */
/* ------------------------------------------------------------------ */

describe("updateRelayUrl", () => {
  it("sets textContent on relay-url element", async () => {
    const { updateRelayUrl } = await importOptions();
    updateRelayUrl(9999);
    expect(elements["relay-url"].textContent).toBe("http://127.0.0.1:9999/");
  });

  it("handles missing element gracefully", async () => {
    const { updateRelayUrl } = await importOptions();
    // Override AFTER import so module side effects have the real elements
    (globalThis as any).document.getElementById = vi.fn(() => null);
    expect(() => updateRelayUrl(9999)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  setStatus                                                          */
/* ------------------------------------------------------------------ */

describe("setStatus", () => {
  it("sets data-kind and textContent", async () => {
    const { setStatus } = await importOptions();
    setStatus("ok", "All good");
    expect(elements.status.dataset.kind).toBe("ok");
    expect(elements.status.textContent).toBe("All good");
  });

  it("handles missing element gracefully", async () => {
    const { setStatus } = await importOptions();
    // Override AFTER import so module side effects have the real elements
    (globalThis as any).document.getElementById = vi.fn(() => null);
    expect(() => setStatus("ok", "test")).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  checkRelayReachable                                                */
/* ------------------------------------------------------------------ */

describe("checkRelayReachable", () => {
  it("sets ok status on successful fetch", async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const { checkRelayReachable } = await importOptions();
    await checkRelayReachable(18792);
    expect(elements.status.dataset.kind).toBe("ok");
    expect(elements.status.textContent).toContain("Relay reachable");
  });

  it("sets error status on fetch failure", async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error("connect refused");
    });
    const { checkRelayReachable } = await importOptions();
    await checkRelayReachable(18792);
    expect(elements.status.dataset.kind).toBe("error");
    expect(elements.status.textContent).toContain("Relay not reachable");
  });

  it("sets error status on non-ok response", async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
    }));
    const { checkRelayReachable } = await importOptions();
    await checkRelayReachable(18792);
    expect(elements.status.dataset.kind).toBe("error");
  });
});

/* ------------------------------------------------------------------ */
/*  load                                                               */
/* ------------------------------------------------------------------ */

describe("load", () => {
  it("reads storage and updates DOM", async () => {
    chromeMock.storage.local._data.set("relayPort", 9000);
    const { load } = await importOptions();
    await load();
    expect(elements.port.value).toBe("9000");
    expect(elements["relay-url"].textContent).toBe("http://127.0.0.1:9000/");
  });

  it("defaults when storage is empty", async () => {
    const { load } = await importOptions();
    await load();
    expect(elements.port.value).toBe("18792");
  });
});

/* ------------------------------------------------------------------ */
/*  save                                                               */
/* ------------------------------------------------------------------ */

describe("save", () => {
  it("writes clamped port to storage", async () => {
    const { save } = await importOptions();
    // Set port AFTER import — load() side effect resets it to default
    elements.port.value = "4000";
    chromeMock.storage.local.set.mockClear();
    await save();
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      relayPort: 4000,
    });
  });

  it("calls checkRelayReachable after saving", async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const { save } = await importOptions();
    elements.port.value = "4000";
    await save();
    expect(elements.status.dataset.kind).toBe("ok");
  });
});
