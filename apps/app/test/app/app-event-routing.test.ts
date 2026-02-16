import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockState = {
  onboardingLoading: boolean;
  startupPhase: string;
  authRequired: boolean;
  onboardingComplete: boolean;
  tab: "chat";
  actionNotice: null;
  handleStart: () => void;
  handleStop: () => void;
  handlePauseResume: () => void;
  handleRestart: () => void;
  setTab: ReturnType<typeof vi.fn>;
  setActionNotice: ReturnType<typeof vi.fn>;
  openCommandPalette: ReturnType<typeof vi.fn>;
  loadPlugins: ReturnType<typeof vi.fn>;
  loadSkills: ReturnType<typeof vi.fn>;
  loadLogs: ReturnType<typeof vi.fn>;
  loadWorkbench: ReturnType<typeof vi.fn>;
};

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

const { dispatchBus } = vi.hoisted(() => ({
  dispatchBus: new EventTarget(),
}));

const dispatchEvent = (event: Event) => {
  window.dispatchEvent(event);
};

const { workspaceNotesPanelMock, customActionEditorMock, customActionsPanelMock } = vi.hoisted(() => ({
  workspaceNotesPanelMock: {
    lastProps: null as
      | null
      | {
          open: boolean;
          mode: "edit" | "view" | "split";
          seedText: string;
          onCreateActionFromNote: (content: string, title?: string) => void;
          onCreateSkillFromNote: (content: string, title?: string) => Promise<void>;
        },
  },
  customActionEditorMock: {
    lastProps: null as
      | null
      | {
          open: boolean;
          action: unknown;
          seedPrompt: string;
          onSave: ReturnType<typeof vi.fn>;
          onClose: ReturnType<typeof vi.fn>;
        },
  },
  customActionsPanelMock: {
    lastProps: null as
      | null
      | {
          open: boolean;
          onClose: ReturnType<typeof vi.fn>;
          onOpenEditor: (action: unknown) => void;
        },
  },
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks/useContextMenu.js", () => ({
  useContextMenu: () => ({
    saveCommandModalOpen: false,
    saveCommandText: "",
    confirmSaveCommand: vi.fn(),
    closeSaveCommandModal: vi.fn(),
  }),
}));

vi.mock("../../src/components/Header.js", () => ({
  Header: () => React.createElement("header", { "data-testid": "header" }, "Header"),
}));

vi.mock("../../src/components/Nav.js", () => ({
  Nav: () => React.createElement("nav", { "data-testid": "nav" }, "Nav"),
}));

vi.mock("../../src/components/CommandPalette.js", () => ({
  CommandPalette: () =>
    React.createElement("div", { "data-testid": "command-palette" }, "CommandPalette"),
}));

vi.mock("../../src/components/EmotePicker.js", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));

vi.mock("../../src/components/SaveCommandModal.js", () => ({
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
}));

vi.mock("../../src/components/PairingView.js", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));

vi.mock("../../src/components/OnboardingWizard.js", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));

vi.mock("../../src/components/ChatView.js", () => ({
  ChatView: () => React.createElement("section", null, "ChatView"),
}));

vi.mock("../../src/components/ConversationsSidebar.js", () => ({
  ConversationsSidebar: () => React.createElement("aside", null, "ConversationsSidebar"),
}));

vi.mock("../../src/components/AutonomousPanel.js", () => ({
  AutonomousPanel: () => React.createElement("aside", null, "AutonomousPanel"),
}));

vi.mock("../../src/components/TerminalPanel.js", () => ({
  TerminalPanel: () => React.createElement("footer", null, "TerminalPanel"),
}));

vi.mock("../../src/components/WorkspaceNotesPanel.js", () => ({
  WorkspaceNotesPanel: (props: {
    open: boolean;
    mode: "edit" | "view" | "split";
    seedText?: string;
    onClose: () => void;
    onCreateActionFromNote: (content: string, title?: string) => void;
    onCreateSkillFromNote: (content: string, title?: string) => Promise<void>;
  }) => {
    workspaceNotesPanelMock.lastProps = {
      open: props.open,
      mode: props.mode,
      seedText: props.seedText ?? "",
      onCreateActionFromNote: props.onCreateActionFromNote,
      onCreateSkillFromNote: props.onCreateSkillFromNote,
    };

    return React.createElement(
      "div",
      {
        "data-testid": "workspace-notes-panel",
        "data-open": String(props.open),
        "data-mode": props.mode,
        "data-seed": props.seedText ?? "",
      },
      React.createElement(
        "button",
        {
          onClick: () => props.onCreateActionFromNote("note prompt from panel", "Panel Note"),
        },
        "Create from notes",
      ),
      React.createElement(
        "button",
        { onClick: props.onClose },
        "Close Notes",
      ),
    );
  },
}));

vi.mock("../../src/components/CustomActionsPanel.js", () => ({
  CustomActionsPanel: (props: {
    open: boolean;
    onClose: () => void;
    onOpenEditor: (action?: unknown | null) => void;
  }) => {
    customActionsPanelMock.lastProps = {
      open: props.open,
      onClose: props.onClose,
      onOpenEditor: props.onOpenEditor,
    };

    return React.createElement(
      "aside",
      {
        "data-testid": "custom-actions-panel",
        "data-open": String(props.open),
      },
      "CustomActionsPanel",
    );
  },
}));

vi.mock("../../src/components/CustomActionEditor.js", () => ({
  CustomActionEditor: (props: {
    open: boolean;
    action: unknown;
    seedPrompt?: string;
    onSave: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }) => {
    customActionEditorMock.lastProps = {
      open: props.open,
      action: props.action,
      seedPrompt: props.seedPrompt ?? "",
      onSave: props.onSave,
      onClose: props.onClose,
    };

    return props.open
      ? React.createElement(
          "div",
          { "data-testid": "custom-action-editor" },
          `Seed:${props.seedPrompt ?? ""}`,
        )
      : null;
  },
}));

import { App } from "../../src/App";

describe("App event routing for notes and custom actions", () => {
  const setTab = vi.fn();
  const setActionNotice = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, "addEventListener", {
      configurable: true,
      writable: true,
      value: dispatchBus.addEventListener.bind(dispatchBus),
    });
    Object.defineProperty(window, "removeEventListener", {
      configurable: true,
      writable: true,
      value: dispatchBus.removeEventListener.bind(dispatchBus),
    });
    Object.defineProperty(window, "dispatchEvent", {
      configurable: true,
      writable: true,
      value: vi.fn((event: Event) => dispatchBus.dispatchEvent(event)),
    });
    workspaceNotesPanelMock.lastProps = null;
    customActionEditorMock.lastProps = null;
    customActionsPanelMock.lastProps = null;
    mockUseApp.mockReset();

    mockUseApp.mockReturnValue({
      onboardingLoading: false,
      startupPhase: "ready",
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
      handleStart: vi.fn(),
      handleStop: vi.fn(),
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      setTab,
      setActionNotice,
      openCommandPalette: vi.fn(),
      loadPlugins: vi.fn(),
      loadSkills: vi.fn(),
      loadLogs: vi.fn(),
      loadWorkbench: vi.fn(),
    } as MockState);
  });

  it("opens notes from top-bar and command events, then transitions to action editor", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:open-notes-panel", {
          detail: { mode: "edit", seedText: "note seed from event" },
        }),
      );
    });

    expect(workspaceNotesPanelMock.lastProps?.open).toBe(true);
    expect(workspaceNotesPanelMock.lastProps?.mode).toBe("edit");
    expect(workspaceNotesPanelMock.lastProps?.seedText).toBe("note seed from event");

    const getCreateFromNotesButton = () =>
      tree!.root.find(
        (node) =>
          node.type === "button" &&
          node.children.join("") === "Create from notes",
      );

    await act(async () => {
      const createFromNotesButton = getCreateFromNotesButton();
      createFromNotesButton.props.onClick();
    });

    expect(customActionEditorMock.lastProps?.open).toBe(true);
    expect(customActionEditorMock.lastProps?.seedPrompt).toBe("note prompt from panel");
    expect(workspaceNotesPanelMock.lastProps?.open).toBe(false);

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:app-command", {
          detail: { command: "open-notes-view" },
        }),
      );
    });

    expect(workspaceNotesPanelMock.lastProps?.open).toBe(true);
    expect(workspaceNotesPanelMock.lastProps?.mode).toBe("view");
    expect(customActionEditorMock.lastProps?.open).toBe(false);

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:app-command", {
          detail: { command: "open-custom-actions-panel" },
        }),
      );
    });

    expect(customActionsPanelMock.lastProps?.open).toBe(true);
    expect(workspaceNotesPanelMock.lastProps?.open).toBe(false);

    await act(async () => {
      dispatchEvent(new Event("toggle-custom-actions-panel"));
    });

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:app-command", {
          detail: {
            command: "open-custom-action-editor-with-prompt",
            seedPrompt: "custom prompt for generation",
          },
        }),
      );
    });

    expect(customActionEditorMock.lastProps?.open).toBe(true);
    expect(customActionEditorMock.lastProps?.seedPrompt).toBe(
      "custom prompt for generation",
    );

    expect(customActionsPanelMock.lastProps?.open).toBe(false);

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:app-command", {
          detail: { command: "open-notes-split" },
        }),
      );
    });

    expect(workspaceNotesPanelMock.lastProps?.open).toBe(true);
    expect(workspaceNotesPanelMock.lastProps?.mode).toBe("split");
    expect(customActionEditorMock.lastProps?.open).toBe(false);

    await act(async () => {
      dispatchEvent(
        new CustomEvent("milaidy:app-command", {
          detail: {
            command: "open-notes-with-seed",
            seedText: "seed from app command",
          },
        }),
      );
    });

    expect(workspaceNotesPanelMock.lastProps?.open).toBe(true);
    expect(workspaceNotesPanelMock.lastProps?.seedText).toBe("seed from app command");

    expect(setTab).toHaveBeenCalledWith("chat");
  });
});
