import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ChromeMock, installChromeMock } from "./chrome-mock";

/* ------------------------------------------------------------------ */
/*  MockWebSocket                                                      */
/* ------------------------------------------------------------------ */

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn();

  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket._last = this;
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  triggerMessage(data: string) {
    this.onmessage?.({ data });
  }

  triggerClose(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  triggerError() {
    this.onerror?.({});
  }

  static _last: MockWebSocket | null = null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Wait for ensureRelayConnection to create the WebSocket, then open it. */
async function waitForWsAndOpen(): Promise<MockWebSocket> {
  await vi.waitFor(() => {
    if (!MockWebSocket._last) throw new Error("ws not created yet");
  });
  const ws = MockWebSocket._last;
  if (!ws) throw new Error("ws not created yet");
  ws.triggerOpen();
  return ws;
}

/** Import bg, start connection, open ws, return {bg, ws}. */
async function connectBg() {
  const bg = await importBg();
  const p = bg.ensureRelayConnection();
  const ws = await waitForWsAndOpen();
  await p;
  return { bg, ws };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let chromeMock: ChromeMock;

// Provide WebSocket constants on globalThis so background.js can
// reference WebSocket.OPEN etc.
// biome-ignore lint/suspicious/noExplicitAny: mocking WebSocket on globalThis requires any
(globalThis as any).WebSocket = MockWebSocket;

beforeEach(() => {
  vi.resetModules();
  chromeMock = installChromeMock();
  MockWebSocket._last = null;

  // Default fetch: relay reachable
  // biome-ignore lint/suspicious/noExplicitAny: mocking fetch on globalThis requires any
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200 }));
  // biome-ignore lint/suspicious/noExplicitAny: mocking AbortSignal on globalThis requires any
  (globalThis as any).AbortSignal = { timeout: () => ({}) };
});

/* ------------------------------------------------------------------ */
/*  Dynamic import helper — fresh module each test via vi.resetModules */
/* ------------------------------------------------------------------ */

async function importBg() {
  const mod = await import("../background.js");
  mod._resetForTest();
  return mod;
}

/* ------------------------------------------------------------------ */
/*  getRelayPort                                                       */
/* ------------------------------------------------------------------ */

describe("getRelayPort", () => {
  it("returns default port when storage is empty", async () => {
    const { getRelayPort } = await importBg();
    expect(await getRelayPort()).toBe(18792);
  });

  it("returns stored port", async () => {
    chromeMock.storage.local._data.set("relayPort", 9000);
    const { getRelayPort } = await importBg();
    expect(await getRelayPort()).toBe(9000);
  });

  it("returns default for invalid values", async () => {
    chromeMock.storage.local._data.set("relayPort", "garbage");
    const { getRelayPort } = await importBg();
    expect(await getRelayPort()).toBe(18792);
  });
});

/* ------------------------------------------------------------------ */
/*  setBadge                                                           */
/* ------------------------------------------------------------------ */

describe("setBadge", () => {
  it("sets ON badge", async () => {
    const { setBadge } = await importBg();
    setBadge(1, "on");
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 1,
      text: "ON",
    });
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 1,
      color: "#FF5A36",
    });
  });

  it("sets OFF badge (empty text)", async () => {
    const { setBadge } = await importBg();
    setBadge(1, "off");
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 1,
      text: "",
    });
  });

  it("sets connecting badge", async () => {
    const { setBadge } = await importBg();
    setBadge(1, "connecting");
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 1,
      text: "…",
    });
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 1,
      color: "#F59E0B",
    });
  });

  it("sets error badge", async () => {
    const { setBadge } = await importBg();
    setBadge(1, "error");
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 1,
      text: "!",
    });
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 1,
      color: "#B91C1C",
    });
  });
});

/* ------------------------------------------------------------------ */
/*  sendToRelay                                                        */
/* ------------------------------------------------------------------ */

describe("sendToRelay", () => {
  it("throws when ws is null", async () => {
    const { sendToRelay } = await importBg();
    expect(() => sendToRelay({ foo: 1 })).toThrow("Relay not connected");
  });

  it("throws when ws is not OPEN", async () => {
    const bg = await importBg();
    expect(() => bg.sendToRelay({ foo: 1 })).toThrow("Relay not connected");
  });

  it("sends JSON when connected", async () => {
    const { bg, ws } = await connectBg();

    bg.sendToRelay({ method: "test" });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ method: "test" }));
  });
});

/* ------------------------------------------------------------------ */
/*  getTabBySessionId                                                  */
/* ------------------------------------------------------------------ */

describe("getTabBySessionId", () => {
  it("returns main session match", async () => {
    const { getTabBySessionId, tabs, tabBySession } = await importBg();
    tabs.set(42, { state: "connected", sessionId: "s1", targetId: "t1" });
    tabBySession.set("s1", 42);
    expect(getTabBySessionId("s1")).toEqual({ tabId: 42, kind: "main" });
  });

  it("returns child session match", async () => {
    const { getTabBySessionId, childSessionToTab } = await importBg();
    childSessionToTab.set("child-1", 42);
    expect(getTabBySessionId("child-1")).toEqual({ tabId: 42, kind: "child" });
  });

  it("returns null for unknown session", async () => {
    const { getTabBySessionId } = await importBg();
    expect(getTabBySessionId("unknown")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  getTabByTargetId                                                   */
/* ------------------------------------------------------------------ */

describe("getTabByTargetId", () => {
  it("finds tab by targetId", async () => {
    const { getTabByTargetId, tabs } = await importBg();
    tabs.set(10, { state: "connected", targetId: "target-A" });
    expect(getTabByTargetId("target-A")).toBe(10);
  });

  it("returns null when no match", async () => {
    const { getTabByTargetId } = await importBg();
    expect(getTabByTargetId("nope")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  onRelayClosed                                                      */
/* ------------------------------------------------------------------ */

describe("onRelayClosed", () => {
  it("rejects all pending promises", async () => {
    const { onRelayClosed, pending } = await importBg();
    const p1 = new Promise((resolve, reject) => {
      pending.set(1, { resolve, reject });
    });
    const p2 = new Promise((resolve, reject) => {
      pending.set(2, { resolve, reject });
    });
    onRelayClosed("test");
    await expect(p1).rejects.toThrow("Relay disconnected");
    await expect(p2).rejects.toThrow("Relay disconnected");
  });

  it("clears pending map", async () => {
    const { onRelayClosed, pending } = await importBg();
    pending.set(1, { resolve: vi.fn(), reject: vi.fn() });
    onRelayClosed("test");
    expect(pending.size).toBe(0);
  });

  it("detaches all tracked tabs", async () => {
    const { onRelayClosed, tabs } = await importBg();
    tabs.set(10, { state: "connected", sessionId: "s1" });
    tabs.set(20, { state: "connected", sessionId: "s2" });
    onRelayClosed("test");
    expect(chromeMock.debugger.detach).toHaveBeenCalledTimes(2);
  });

  it("clears all maps", async () => {
    const { onRelayClosed, tabs, tabBySession, childSessionToTab } =
      await importBg();
    tabs.set(10, { state: "connected" });
    tabBySession.set("s1", 10);
    childSessionToTab.set("c1", 10);
    onRelayClosed("test");
    expect(tabs.size).toBe(0);
    expect(tabBySession.size).toBe(0);
    expect(childSessionToTab.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  onRelayMessage                                                     */
/* ------------------------------------------------------------------ */

describe("onRelayMessage", () => {
  it("ignores invalid JSON", async () => {
    const { onRelayMessage } = await importBg();
    await expect(onRelayMessage("not json{")).resolves.toBeUndefined();
  });

  it("responds to ping with pong", async () => {
    const { bg, ws } = await connectBg();
    ws.send.mockClear();

    await bg.onRelayMessage(JSON.stringify({ method: "ping" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ method: "pong" }));
  });

  it("resolves pending on result", async () => {
    const { onRelayMessage, pending } = await importBg();
    let resolved: unknown;
    const p = new Promise((resolve, reject) => {
      pending.set(42, { resolve, reject });
    }).then((v) => (resolved = v));

    await onRelayMessage(JSON.stringify({ id: 42, result: { ok: true } }));
    await p;
    expect(resolved).toEqual({ ok: true });
  });

  it("rejects pending on error", async () => {
    const { onRelayMessage, pending } = await importBg();
    const p = new Promise((resolve, reject) => {
      pending.set(43, { resolve, reject });
    });

    await onRelayMessage(JSON.stringify({ id: 43, error: "boom" }));
    await expect(p).rejects.toThrow("boom");
  });

  it("ignores unmatched id", async () => {
    const { onRelayMessage, pending } = await importBg();
    await expect(
      onRelayMessage(JSON.stringify({ id: 99, result: "x" })),
    ).resolves.toBeUndefined();
    expect(pending.size).toBe(0);
  });

  it("dispatches forwardCDPCommand", async () => {
    const { bg, ws } = await connectBg();

    bg.tabs.set(1, { state: "connected", sessionId: "s1", targetId: "t1" });
    bg.tabBySession.set("s1", 1);

    chromeMock.debugger.sendCommand.mockResolvedValueOnce({ result: "ok" });
    ws.send.mockClear();

    await bg.onRelayMessage(
      JSON.stringify({
        id: 100,
        method: "forwardCDPCommand",
        params: { method: "Page.navigate", params: { url: "http://x.com" } },
      }),
    );

    const calls = ws.send.mock.calls;
    const last = JSON.parse(calls[calls.length - 1][0]);
    expect(last.id).toBe(100);
    expect(last.result).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  ensureRelayConnection                                              */
/* ------------------------------------------------------------------ */

describe("ensureRelayConnection", () => {
  it("is a no-op when ws is already open", async () => {
    const { bg } = await connectBg();

    // Second call should be a no-op (no new WebSocket created)
    const prevWs = MockWebSocket._last;
    await bg.ensureRelayConnection();
    expect(MockWebSocket._last).toBe(prevWs);
  });

  it("does preflight fetch", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    // biome-ignore lint/suspicious/noExplicitAny: mocking fetch on globalThis requires any
    (globalThis as any).fetch = fetchMock;
    const bg = await importBg();
    const p = bg.ensureRelayConnection();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const _ws = await waitForWsAndOpen();
    await p;
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws when preflight fetch fails", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mocking fetch on globalThis requires any
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const bg = await importBg();
    await expect(bg.ensureRelayConnection()).rejects.toThrow(
      "Relay server not reachable",
    );
  });

  it("resolves when ws opens", async () => {
    const bg = await importBg();
    const p = bg.ensureRelayConnection();
    await waitForWsAndOpen();
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects on ws error", async () => {
    const bg = await importBg();
    const p = bg.ensureRelayConnection();
    await vi.waitFor(() => {
      if (!MockWebSocket._last) throw new Error("ws not created yet");
    });
    // biome-ignore lint/style/noNonNullAssertion: already checked in waitFor above
    MockWebSocket._last!.triggerError();
    await expect(p).rejects.toThrow("WebSocket connect failed");
  });
});

/* ------------------------------------------------------------------ */
/*  attachTab                                                          */
/* ------------------------------------------------------------------ */

describe("attachTab", () => {
  async function setupConnected() {
    const { bg, ws } = await connectBg();
    return { bg, ws };
  }

  it("calls debugger.attach with version 1.3", async () => {
    const { bg } = await setupConnected();
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "tid-1" } };
        return {};
      },
    );
    await bg.attachTab(1);
    expect(chromeMock.debugger.attach).toHaveBeenCalledWith(
      { tabId: 1 },
      "1.3",
    );
  });

  it("fetches target info", async () => {
    const { bg } = await setupConnected();
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "tid-2", type: "page" } };
        return {};
      },
    );
    const result = await bg.attachTab(5);
    expect(result.targetId).toBe("tid-2");
    expect(result.sessionId).toMatch(/^cb-tab-/);
  });

  it("throws without targetId", async () => {
    const { bg } = await setupConnected();
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo") return { targetInfo: {} };
        return {};
      },
    );
    await expect(bg.attachTab(1)).rejects.toThrow(
      "Target.getTargetInfo returned no targetId",
    );
  });

  it("stores session in maps", async () => {
    const { bg } = await setupConnected();
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "tid-3" } };
        return {};
      },
    );
    const result = await bg.attachTab(7);
    expect(bg.tabs.get(7)?.sessionId).toBe(result.sessionId);
    expect(bg.tabBySession.get(result.sessionId)).toBe(7);
  });

  it("sends attachedToTarget event to relay", async () => {
    const { bg, ws } = await setupConnected();
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "tid-4" } };
        return {};
      },
    );
    ws.send.mockClear();
    await bg.attachTab(3);
    const sent = ws.send.mock.calls.map((c: unknown[]) =>
      JSON.parse(c[0] as string),
    );
    const attachEvent = sent.find(
      // biome-ignore lint/suspicious/noExplicitAny: parsed JSON has dynamic structure
      (m: any) =>
        m.method === "forwardCDPEvent" &&
        m.params?.method === "Target.attachedToTarget",
    );
    expect(attachEvent).toBeDefined();
    expect(attachEvent.params.params.targetInfo.attached).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  detachTab                                                          */
/* ------------------------------------------------------------------ */

describe("detachTab", () => {
  async function setupWithTab() {
    const { bg, ws } = await connectBg();
    bg.tabs.set(10, {
      state: "connected",
      sessionId: "s10",
      targetId: "t10",
    });
    bg.tabBySession.set("s10", 10);
    bg.childSessionToTab.set("child-s10", 10);
    return { bg, ws };
  }

  it("sends detachedFromTarget to relay", async () => {
    const { bg, ws } = await setupWithTab();
    ws.send.mockClear();
    await bg.detachTab(10, "user");
    const sent = ws.send.mock.calls.map((c: unknown[]) =>
      JSON.parse(c[0] as string),
    );
    const detachEvent = sent.find(
      // biome-ignore lint/suspicious/noExplicitAny: parsed JSON has dynamic structure
      (m: any) =>
        m.method === "forwardCDPEvent" &&
        m.params?.method === "Target.detachedFromTarget",
    );
    expect(detachEvent).toBeDefined();
  });

  it("cleans session maps", async () => {
    const { bg } = await setupWithTab();
    await bg.detachTab(10, "user");
    expect(bg.tabBySession.has("s10")).toBe(false);
    expect(bg.tabs.has(10)).toBe(false);
  });

  it("cleans child sessions", async () => {
    const { bg } = await setupWithTab();
    await bg.detachTab(10, "user");
    expect(bg.childSessionToTab.has("child-s10")).toBe(false);
  });

  it("calls debugger.detach", async () => {
    const { bg } = await setupWithTab();
    await bg.detachTab(10, "user");
    expect(chromeMock.debugger.detach).toHaveBeenCalledWith({ tabId: 10 });
  });
});

/* ------------------------------------------------------------------ */
/*  handleForwardCdpCommand                                            */
/* ------------------------------------------------------------------ */

describe("handleForwardCdpCommand", () => {
  async function setupWithTab() {
    const { bg, ws } = await connectBg();
    bg.tabs.set(1, { state: "connected", sessionId: "s1", targetId: "t1" });
    bg.tabBySession.set("s1", 1);
    return { bg, ws };
  }

  it("handles Runtime.enable (disable then enable)", async () => {
    vi.useFakeTimers();
    const { bg } = await setupWithTab();
    chromeMock.debugger.sendCommand.mockResolvedValue({});
    const p = bg.handleForwardCdpCommand({
      id: 1,
      params: { method: "Runtime.enable", sessionId: "s1" },
    });
    await vi.advanceTimersByTimeAsync(100);
    await p;
    const methods = chromeMock.debugger.sendCommand.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    expect(methods).toContain("Runtime.disable");
    expect(methods).toContain("Runtime.enable");
    vi.useRealTimers();
  });

  it("handles Target.createTarget", async () => {
    const { bg } = await setupWithTab();
    chromeMock.tabs.create.mockResolvedValue({ id: 50 });
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "new-target" } };
        return {};
      },
    );
    vi.useFakeTimers();
    const p = bg.handleForwardCdpCommand({
      id: 2,
      params: {
        method: "Target.createTarget",
        params: { url: "http://example.com" },
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await p;
    expect(result).toEqual({ targetId: "new-target" });
    vi.useRealTimers();
  });

  it("handles Target.closeTarget", async () => {
    const { bg } = await setupWithTab();
    bg.tabs.set(20, { state: "connected", targetId: "close-me" });
    const result = await bg.handleForwardCdpCommand({
      id: 3,
      params: {
        method: "Target.closeTarget",
        params: { targetId: "close-me" },
      },
    });
    expect(result).toEqual({ success: true });
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(20);
  });

  it("handles Target.activateTarget", async () => {
    const { bg } = await setupWithTab();
    bg.tabs.set(30, { state: "connected", targetId: "activate-me" });
    chromeMock.tabs.get.mockResolvedValue({ id: 30, windowId: 2 });
    await bg.handleForwardCdpCommand({
      id: 4,
      params: {
        method: "Target.activateTarget",
        params: { targetId: "activate-me" },
      },
    });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(2, {
      focused: true,
    });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(30, { active: true });
  });

  it("sends generic command via debugger", async () => {
    const { bg } = await setupWithTab();
    chromeMock.debugger.sendCommand.mockResolvedValue({ nodes: [] });
    const result = await bg.handleForwardCdpCommand({
      id: 5,
      params: {
        method: "DOM.getDocument",
        sessionId: "s1",
      },
    });
    expect(result).toEqual({ nodes: [] });
  });

  it("routes child session commands with sessionId", async () => {
    const { bg } = await setupWithTab();
    bg.childSessionToTab.set("child-s1", 1);
    chromeMock.debugger.sendCommand.mockResolvedValue({});
    await bg.handleForwardCdpCommand({
      id: 6,
      params: {
        method: "Page.navigate",
        sessionId: "child-s1",
        params: { url: "http://test.com" },
      },
    });
    const lastCall =
      chromeMock.debugger.sendCommand.mock.calls[
        chromeMock.debugger.sendCommand.mock.calls.length - 1
      ];
    expect(lastCall[0]).toEqual({ tabId: 1, sessionId: "child-s1" });
  });

  it("throws when no tab attached", async () => {
    const bg = await importBg();
    await expect(
      bg.handleForwardCdpCommand({
        id: 7,
        params: { method: "Page.navigate" },
      }),
    ).rejects.toThrow("No attached tab");
  });

  it("falls back to first connected tab when no sessionId", async () => {
    const { bg } = await setupWithTab();
    chromeMock.debugger.sendCommand.mockResolvedValue({ ok: true });
    const result = await bg.handleForwardCdpCommand({
      id: 8,
      params: { method: "Page.reload" },
    });
    expect(result).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/*  onDebuggerEvent                                                    */
/* ------------------------------------------------------------------ */

describe("onDebuggerEvent", () => {
  it("forwards event to relay", async () => {
    const { bg, ws } = await connectBg();

    bg.tabs.set(1, { state: "connected", sessionId: "s1", targetId: "t1" });
    ws.send.mockClear();

    bg.onDebuggerEvent({ tabId: 1 }, "Page.loadEventFired", { timestamp: 1 });
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.method).toBe("forwardCDPEvent");
    expect(sent.params.method).toBe("Page.loadEventFired");
  });

  it("tracks child sessions on Target.attachedToTarget", async () => {
    const { bg } = await connectBg();

    bg.tabs.set(1, { state: "connected", sessionId: "s1", targetId: "t1" });
    bg.onDebuggerEvent({ tabId: 1 }, "Target.attachedToTarget", {
      sessionId: "child-99",
    });
    expect(bg.childSessionToTab.get("child-99")).toBe(1);
  });

  it("ignores tabs without sessionId", async () => {
    const { bg, ws } = await connectBg();

    bg.tabs.set(1, { state: "connecting" }); // no sessionId
    ws.send.mockClear();
    bg.onDebuggerEvent({ tabId: 1 }, "Page.loadEventFired", {});
    expect(ws.send).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  onDebuggerDetach                                                   */
/* ------------------------------------------------------------------ */

describe("onDebuggerDetach", () => {
  it("detaches known tab", async () => {
    const { bg } = await connectBg();

    bg.tabs.set(5, { state: "connected", sessionId: "s5", targetId: "t5" });
    bg.tabBySession.set("s5", 5);
    bg.onDebuggerDetach({ tabId: 5 }, "target_closed");
    // detachTab is called async via void, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(bg.tabs.has(5)).toBe(false);
  });

  it("ignores unknown tabs", async () => {
    const bg = await importBg();
    bg.onDebuggerDetach({ tabId: 999 }, "target_closed");
  });
});

/* ------------------------------------------------------------------ */
/*  connectOrToggleForActiveTab                                        */
/* ------------------------------------------------------------------ */

describe("connectOrToggleForActiveTab", () => {
  it("detaches when already connected (toggle off)", async () => {
    const { bg } = await connectBg();

    bg.tabs.set(10, {
      state: "connected",
      sessionId: "s10",
      targetId: "t10",
    });
    bg.tabBySession.set("s10", 10);
    chromeMock.tabs.query.mockResolvedValue([{ id: 10 }]);

    await bg.connectOrToggleForActiveTab();
    expect(bg.tabs.has(10)).toBe(false);
  });

  it("connects new tab", async () => {
    const bg = await importBg();
    chromeMock.tabs.query.mockResolvedValue([{ id: 20 }]);
    chromeMock.debugger.sendCommand.mockImplementation(
      async (_d: unknown, method: string) => {
        if (method === "Target.getTargetInfo")
          return { targetInfo: { targetId: "new-t" } };
        return {};
      },
    );

    const connectP = bg.connectOrToggleForActiveTab();
    await vi.waitFor(() => expect(MockWebSocket._last).not.toBeNull());
    // biome-ignore lint/style/noNonNullAssertion: checked by waitFor above
    MockWebSocket._last!.triggerOpen();
    await connectP;

    expect(bg.tabs.get(20)?.state).toBe("connected");
  });

  it("handles connection error", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mocking fetch on globalThis requires any
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const bg = await importBg();
    chromeMock.tabs.query.mockResolvedValue([{ id: 30 }]);

    await bg.connectOrToggleForActiveTab();
    expect(bg.tabs.has(30)).toBe(false);
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 30, text: "!" }),
    );
  });

  it("does nothing when no active tab", async () => {
    const bg = await importBg();
    chromeMock.tabs.query.mockResolvedValue([]);
    await bg.connectOrToggleForActiveTab();
    expect(bg.tabs.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  maybeOpenHelpOnce                                                  */
/* ------------------------------------------------------------------ */

describe("maybeOpenHelpOnce", () => {
  it("opens options page on first call", async () => {
    const bg = await importBg();
    await bg.maybeOpenHelpOnce();
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("skips on second call", async () => {
    const bg = await importBg();
    await bg.maybeOpenHelpOnce();
    chromeMock.runtime.openOptionsPage.mockClear();
    await bg.maybeOpenHelpOnce();
    expect(chromeMock.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Side effects: listener registration                                */
/* ------------------------------------------------------------------ */

describe("side effects", () => {
  it("registers onClicked listener", async () => {
    await importBg();
    expect(chromeMock.action.onClicked.addListener).toHaveBeenCalled();
  });

  it("registers onInstalled listener", async () => {
    await importBg();
    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalled();
  });
});
