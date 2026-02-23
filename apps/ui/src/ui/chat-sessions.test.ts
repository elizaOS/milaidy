import { beforeEach, describe, expect, it, vi } from "vitest";
import { MilaidyApp } from "./app.js";
import type { ChatMessage } from "./api-client.js";

interface TestSession {
  id: string;
  name: string;
  updatedAt: number;
  messages: ChatMessage[];
}

const userMsg = (text: string): ChatMessage => ({
  role: "user",
  text,
  timestamp: Date.now(),
});

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
    (app as any).tab = "apps";
    (app as any).chatSessions = [
      {
        id: "s-1",
        name: "Chat 1",
        updatedAt: Date.now(),
        messages: [userMsg("existing")],
      } satisfies TestSession,
    ];
    (app as any).activeSessionId = "s-1";
    (app as any).chatMessages = [userMsg("existing")];

    const setTabSpy = vi
      .spyOn(app as any, "setTab")
      .mockImplementation((tab: string) => {
        (app as any).tab = tab;
      });
    const syncSpy = vi
      .spyOn(app as any, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    (app as any).createNewSession();

    expect(setTabSpy).toHaveBeenCalledWith("chat");
    expect((app as any).tab).toBe("chat");
    expect((app as any).chatMessages).toEqual([]);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("createNewSession reuses existing empty session and still switches to chat", () => {
    const app = new MilaidyApp();
    (app as any).tab = "accounts";
    (app as any).chatSessions = [
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
    (app as any).activeSessionId = "full";
    (app as any).chatMessages = [userMsg("hello")];

    const setTabSpy = vi
      .spyOn(app as any, "setTab")
      .mockImplementation((tab: string) => {
        (app as any).tab = tab;
      });
    const syncSpy = vi
      .spyOn(app as any, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    (app as any).createNewSession();

    expect((app as any).activeSessionId).toBe("empty");
    expect(setTabSpy).toHaveBeenCalledWith("chat");
    expect((app as any).chatMessages).toEqual([]);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("createNewSession keeps viewport sync path when already on chat", () => {
    const app = new MilaidyApp();
    (app as any).tab = "chat";
    (app as any).chatSessions = [
      {
        id: "s-1",
        name: "Chat 1",
        updatedAt: Date.now(),
        messages: [userMsg("existing")],
      } satisfies TestSession,
    ];
    (app as any).activeSessionId = "s-1";
    (app as any).chatMessages = [userMsg("existing")];

    const setTabSpy = vi
      .spyOn(app as any, "setTab")
      .mockImplementation(() => {});
    const syncSpy = vi
      .spyOn(app as any, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    (app as any).createNewSession();

    expect(setTabSpy).not.toHaveBeenCalled();
    expect(syncSpy).toHaveBeenCalledWith("auto");
    expect((app as any).chatMessages).toEqual([]);
  });

  it("switchSession loads selected messages and syncs viewport", () => {
    const app = new MilaidyApp();
    const selectedMessages = [userMsg("selected session message")];
    (app as any).chatSessions = [
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
    (app as any).activeSessionId = "s-1";
    (app as any).chatMessages = [userMsg("old message")];

    const syncSpy = vi
      .spyOn(app as any, "syncChatViewportForActiveSession")
      .mockImplementation(() => {});

    (app as any).switchSession("s-2");

    expect((app as any).activeSessionId).toBe("s-2");
    expect((app as any).chatMessages).toEqual(selectedMessages);
    expect(syncSpy).toHaveBeenCalledWith("auto");
  });
});
