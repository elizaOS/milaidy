import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "./api-client.js";
import { MilaidyApp } from "./app.js";

interface TestSession {
  id: string;
  name: string;
  updatedAt: number;
  messages: ChatMessage[];
}

interface TestableApp {
  tab: string;
  chatSessions: TestSession[];
  activeSessionId: string | null;
  chatMessages: ChatMessage[];
  setTab: (tab: string) => void;
  syncChatViewportForActiveSession: (behavior: "auto" | "smooth") => void;
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
}

const userMsg = (text: string): ChatMessage => ({
  role: "user",
  text,
  timestamp: Date.now(),
});

const asTestableApp = (app: MilaidyApp): TestableApp =>
  app as unknown as TestableApp;

describe("chat sessions", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  it("createNewSession switches to chat when triggered from another tab", () => {
    const app = new MilaidyApp();
    const testApp = asTestableApp(app);
    testApp.tab = "apps";
    testApp.chatSessions = [
      {
        id: "s-1",
        name: "Chat 1",
        updatedAt: Date.now(),
        messages: [userMsg("existing")],
      } satisfies TestSession,
    ];
    testApp.activeSessionId = "s-1";
    testApp.chatMessages = [userMsg("existing")];

    const setTabSpy = vi
      .spyOn(testApp, "setTab")
      .mockImplementation((tab: string) => {
        testApp.tab = tab;
      });
    const syncSpy = vi
      .spyOn(testApp, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    testApp.createNewSession();

    expect(setTabSpy).toHaveBeenCalledWith("chat");
    expect(testApp.tab).toBe("chat");
    expect(testApp.chatMessages).toEqual([]);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("createNewSession reuses existing empty session and still switches to chat", () => {
    const app = new MilaidyApp();
    const testApp = asTestableApp(app);
    testApp.tab = "accounts";
    testApp.chatSessions = [
      {
        id: "empty",
        name: "Chat Empty",
        updatedAt: 1,
        messages: [],
      } satisfies TestSession,
      {
        id: "full",
        name: "Chat Full",
        updatedAt: 2,
        messages: [userMsg("hello")],
      } satisfies TestSession,
    ];
    testApp.activeSessionId = "full";
    testApp.chatMessages = [userMsg("hello")];

    const setTabSpy = vi
      .spyOn(testApp, "setTab")
      .mockImplementation((tab: string) => {
        testApp.tab = tab;
      });
    const syncSpy = vi
      .spyOn(testApp, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    testApp.createNewSession();

    expect(testApp.activeSessionId).toBe("empty");
    expect(setTabSpy).toHaveBeenCalledWith("chat");
    expect(testApp.chatMessages).toEqual([]);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("createNewSession keeps viewport sync path when already on chat", () => {
    const app = new MilaidyApp();
    const testApp = asTestableApp(app);
    testApp.tab = "chat";
    testApp.chatSessions = [
      {
        id: "s-1",
        name: "Chat 1",
        updatedAt: Date.now(),
        messages: [userMsg("existing")],
      } satisfies TestSession,
    ];
    testApp.activeSessionId = "s-1";
    testApp.chatMessages = [userMsg("existing")];

    const setTabSpy = vi.spyOn(testApp, "setTab").mockImplementation(() => {});
    const syncSpy = vi
      .spyOn(testApp, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    testApp.createNewSession();

    expect(setTabSpy).not.toHaveBeenCalled();
    expect(syncSpy).toHaveBeenCalledWith("auto");
    expect(testApp.chatMessages).toEqual([]);
  });

  it("switchSession loads selected messages and syncs viewport", () => {
    const app = new MilaidyApp();
    const testApp = asTestableApp(app);
    const selectedMessages = [userMsg("selected session message")];
    testApp.chatSessions = [
      {
        id: "s-1",
        name: "Chat 1",
        updatedAt: Date.now(),
        messages: [userMsg("old message")],
      } satisfies TestSession,
      {
        id: "s-2",
        name: "Chat 2",
        updatedAt: Date.now(),
        messages: selectedMessages,
      } satisfies TestSession,
    ];
    testApp.activeSessionId = "s-1";
    testApp.chatMessages = [userMsg("old message")];

    const syncSpy = vi
      .spyOn(testApp, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    testApp.switchSession("s-2");

    expect(testApp.activeSessionId).toBe("s-2");
    expect(testApp.chatMessages).toEqual(selectedMessages);
    expect(syncSpy).toHaveBeenCalledWith("auto");
  });
});
